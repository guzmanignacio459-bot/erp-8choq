#!/usr/bin/env node
/**
 * FASE D — Auditoría facturación ERP Mayo (read-only).
 * No modifica datos, no importa, no toca GAS.
 */

import fs from "fs";
import path from "path";

const PROD =
  process.env.PROD_URL ??
  "https://nextjs-boilerplate-topaz-iota-40.vercel.app";
const MAYO_FROM = "2026-05-01";
const MAYO_TO = "2026-05-31";
const TZ = "America/Argentina/Buenos_Aires";
const ART_OFFSET = "-03:00";
const TN_API_GROSS = 59429805.34;

function loadEnv() {
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

function artDayBoundsMs(y, m, d) {
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = `${y}-${pad(m)}-${pad(d)}`;
  return {
    startMs: Date.parse(`${ymd}T00:00:00.000${ART_OFFSET}`),
    endMs: Date.parse(`${ymd}T23:59:59.999${ART_OFFSET}`),
  };
}

function artRangeBoundsMs(fromYmd, toYmd) {
  const [fy, fm, fd] = fromYmd.split("-").map(Number);
  const [ty, tm, td] = toYmd.split("-").map(Number);
  return {
    startMs: artDayBoundsMs(fy, fm, fd).startMs,
    endMs: artDayBoundsMs(ty, tm, td).endMs,
  };
}

function parseInstantMs(iso) {
  const raw = String(iso ?? "").trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split("-").map(Number);
    return artDayBoundsMs(y, m, d).startMs;
  }
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

function parseAmount(v) {
  if (v == null || v === "") return 0;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  let s = String(v).trim().replace(/^\$/, "");
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",") && !s.includes(".")) {
    s = s.replace(",", ".");
  }
  const n = parseFloat(s.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function sum(arr, fn) {
  return arr.reduce((a, x) => a + fn(x), 0);
}

async function fetchErpRemitos() {
  const res = await fetch(`${PROD}/api/erp/remitos`, { cache: "no-store" });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error ?? "ERP remitos fail");
  return json.data ?? [];
}

async function tnFetch(path) {
  const STORE = process.env.TIENDANUBE_STORE_ID;
  const TOKEN = process.env.TIENDANUBE_ACCESS_TOKEN;
  const UA = process.env.TIENDANUBE_USER_AGENT || "8Q ERP";
  const BASE = process.env.TIENDANUBE_API_URL?.trim() || "https://api.tiendanube.com/v1";
  const res = await fetch(`${BASE}/${STORE}${path}`, {
    headers: {
      Authentication: `bearer ${TOKEN}`,
      "User-Agent": UA,
      "Content-Type": "application/json",
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* ignore */
  }
  return { ok: res.ok, status: res.status, json };
}

async function fetchTnMayoPaid() {
  const orders = [];
  for (let page = 1; page <= 50; page++) {
    const q = new URLSearchParams({
      payment_status: "paid",
      created_at_min: "2026-05-01T00:00:00.000Z",
      created_at_max: "2026-05-31T23:59:59.999Z",
      page: String(page),
      per_page: "200",
    });
    const r = await tnFetch(`/orders?${q}`);
    if (!r.ok) throw new Error(`TN ${r.status}`);
    const batch = Array.isArray(r.json) ? r.json : [];
    if (!batch.length) break;
    orders.push(...batch);
    if (batch.length < 200) break;
    await new Promise((x) => setTimeout(x, 150));
  }
  return orders;
}

function buildErpMayo(remitos) {
  const bounds = artRangeBoundsMs(MAYO_FROM, MAYO_TO);
  return remitos
    .map((r) => ({
      idRemito: String(r.idRemito ?? "").trim(),
      tnOrderId: String(r.tnOrderId ?? "").trim(),
      fechaRaw: r.fechaRaw ?? "",
      totalFinal: parseAmount(r.totalFinal),
      subtotal: parseAmount(r.subtotal),
      shipping: parseAmount(r.shipping ?? r.shippingCustomerCost),
      estado: String(r.estado ?? "").trim(),
      metodoDePago: String(r.metodoDePago ?? "").trim(),
      inMayo:
        parseInstantMs(r.fechaRaw || r.fechaDisplay || r.fecha || "") != null &&
        parseInstantMs(r.fechaRaw || r.fechaDisplay || r.fecha || "") >= bounds.startMs &&
        parseInstantMs(r.fechaRaw || r.fechaDisplay || r.fecha || "") <= bounds.endMs,
    }))
    .filter((r) => r.inMayo);
}

loadEnv();

const remitosAll = await fetchErpRemitos();
const erpMayo = buildErpMayo(remitosAll);

const erpByTn = new Map();
for (const r of erpMayo) {
  if (!r.tnOrderId) continue;
  if (!erpByTn.has(r.tnOrderId)) erpByTn.set(r.tnOrderId, []);
  erpByTn.get(r.tnOrderId).push(r);
}

const dupGroups = [...erpByTn.entries()].filter(([, rows]) => rows.length > 1);
const extraDupRows = dupGroups.flatMap(([, rows]) => rows.slice(1));
const dupExtraImpact = sum(extraDupRows, (r) => r.totalFinal);

// Dedup: keep first remito per TN (by idRemito sort)
function dedupFirstPerTn(rows) {
  const byTn = new Map();
  for (const r of rows) {
    if (!r.tnOrderId) continue;
    const existing = byTn.get(r.tnOrderId);
    if (!existing || r.idRemito < existing.idRemito) byTn.set(r.tnOrderId, r);
  }
  const noTn = rows.filter((r) => !r.tnOrderId);
  return [...byTn.values(), ...noTn];
}

const deduped = dedupFirstPerTn(erpMayo);
const sinDupRows = erpMayo.filter((r) => !extraDupRows.some((e) => e.idRemito === r.idRemito));

const facturacionActual = sum(erpMayo, (r) => r.totalFinal);
const facturacionSinDup = sum(sinDupRows, (r) => r.totalFinal);
const facturacionDedupConsolidado = sum(deduped, (r) => r.totalFinal);

console.error("Fetching TN API Mayo paid...");
const tnOrders = await fetchTnMayoPaid();
const tnById = new Map(tnOrders.map((o) => [String(o.id), o]));
const tnGross = sum(tnOrders, (o) => parseAmount(o.total ?? o.total_price));

// Per-order drift: compare ERP first remito vs TN total
const driftRows = [];
for (const [tn, rows] of erpByTn) {
  const o = tnById.get(tn);
  const erpFirst = [...rows].sort((a, b) => a.idRemito.localeCompare(b.idRemito))[0];
  const tnTotal = o ? parseAmount(o.total) : null;
  const delta = tnTotal != null ? erpFirst.totalFinal - tnTotal : null;
  driftRows.push({
    tn,
    erpTotal: erpFirst.totalFinal,
    tnTotal,
    delta,
    dupCount: rows.length,
    dupExtra: rows.length > 1 ? sum(rows.slice(1), (r) => r.totalFinal) : 0,
    inTnApi: !!o,
  });
}

const withTn = driftRows.filter((d) => d.tnTotal != null);
const driftSum = sum(withTn, (d) => d.delta ?? 0);
const driftAbs = sum(withTn, (d) => Math.abs(d.delta ?? 0));
const driftNonZero = withTn.filter((d) => Math.abs(d.delta ?? 0) > 0.01);

// ERP without TN in API
const erpNoTn = erpMayo.filter((r) => r.tnOrderId && !tnById.has(r.tnOrderId));
const erpSinTnOrder = erpMayo.filter((r) => !r.tnOrderId);

// TN without ERP
const erpTnSet = new Set(erpMayo.filter((r) => r.tnOrderId).map((r) => r.tnOrderId));
const tnNoErp = tnOrders.filter((o) => !erpTnSet.has(String(o.id)));

// Decomposition ERP - TN
const residual = facturacionActual - tnGross;

const report = {
  generatedAt: new Date().toISOString(),
  analytics: {
    cuentaFilasRemitos: true,
    ordenesTotales: "remitos.length",
    codigo: "lib/erp/analytics-aggregator.ts → facturacionTotal += parseRemitoAmount(r.totalFinal); ordenesTotales = remitos.length",
  },
  counts: {
    filasRemitosMayo: erpMayo.length,
    tnOrderIdUnicos: erpByTn.size,
    sinTnOrderId: erpSinTnOrder.length,
    gruposDuplicados: dupGroups.length,
    filasDuplicadasExtra: extraDupRows.length,
    filasSinDuplicados: sinDupRows.length,
    tnApiPaidMayoUtc: tnOrders.length,
  },
  money: {
    facturacionErpActual: facturacionActual,
    facturacionErpSinDuplicados: facturacionSinDup,
    facturacionErpDedupConsolidado: facturacionDedupConsolidado,
    impactoDuplicadasExtra: dupExtraImpact,
    tnApiGross: tnGross,
    diffErpVsTnApi: residual,
    diffErpSinDupVsTnApi: facturacionSinDup - tnGross,
    diffDedupConsolidadoVsTnApi: facturacionDedupConsolidado - tnGross,
  },
  decomposition: {
    duplicadasExtra: dupExtraImpact,
    driftTotalFinalVsTnTotal: driftSum,
    driftOrdenesConDelta: driftNonZero.length,
    driftAbsolutoSum: driftAbs,
    erpRemitosTnNoEnApi: { count: erpNoTn.length, sum: sum(erpNoTn, (r) => r.totalFinal) },
    erpSinTnOrderId: { count: erpSinTnOrder.length, sum: sum(erpSinTnOrder, (r) => r.totalFinal) },
    tnSinRemitoErp: { count: tnNoErp.length, sum: sum(tnNoErp, (o) => parseAmount(o.total)) },
    check:
      "ERP - TN ≈ duplicadasExtra + drift(per-TN first remito) + erpOnly - tnOnly",
    reconstructed:
      dupExtraImpact +
      driftSum +
      sum(erpNoTn, (r) => r.totalFinal) -
      sum(tnNoErp, (o) => parseAmount(o.total)),
  },
  duplicadas: dupGroups.map(([tn, rows]) => ({
    tn,
    remitos: rows.map((r) => ({ id: r.idRemito, total: r.totalFinal })),
    totalSumado: sum(rows, (r) => r.totalFinal),
    tnUnicoValor: rows[0].totalFinal,
    extraImpacto: sum(rows.slice(1), (r) => r.totalFinal),
  })),
  driftTop: driftNonZero
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 30)
    .map((d) => ({ ...d, delta: Math.round(d.delta * 100) / 100 })),
};

const outPath = path.join(process.cwd(), "_wip/fase-d-erp-mayo-audit.json");
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

console.log("=== FASE D — ERP Mayo Facturación ===\n");
console.table([
  { metrica: "SUM(Total Final) REMITOS Mayo", valor: Math.round(facturacionActual * 100) / 100 },
  { metrica: "TN_ORDER_ID únicos Mayo", valor: erpByTn.size },
  { metrica: "SUM(Total Final) dedup 1er remito/TN", valor: Math.round(facturacionDedupConsolidado * 100) / 100 },
  { metrica: "Impacto 12 filas duplicadas extra", valor: Math.round(dupExtraImpact * 100) / 100 },
  { metrica: "Facturación sin duplicados (virtual)", valor: Math.round(facturacionSinDup * 100) / 100 },
  { metrica: "Filas sin duplicados (virtual)", valor: sinDupRows.length },
  { metrica: "TN API gross Mayo", valor: Math.round(tnGross * 100) / 100 },
  { metrica: "Δ ERP actual − TN API", valor: Math.round(residual * 100) / 100 },
  { metrica: "Δ ERP sin dup − TN API", valor: Math.round((facturacionSinDup - tnGross) * 100) / 100 },
  { metrica: "Analytics cuenta", valor: `${erpMayo.length} filas REMITOS (no TN únicos)` },
]);

console.log("\n=== Descomposición Δ $411k ===");
console.table({
  duplicadasExtra: Math.round(dupExtraImpact * 100) / 100,
  driftErpVsTnPorOrden: Math.round(driftSum * 100) / 100,
  ordenesConDrift: driftNonZero.length,
  erpTnNoEnApi: sum(erpNoTn, (r) => r.totalFinal),
  tnSinErp: sum(tnNoErp, (o) => parseAmount(o.total)),
  residualDirecto: Math.round(residual * 100) / 100,
});

console.log("\nJSON:", outPath);
