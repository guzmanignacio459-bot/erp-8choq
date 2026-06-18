#!/usr/bin/env node
/**
 * FASE G — Auditoría Abril ERP vs TN (read-only).
 */

import fs from "fs";
import path from "path";

const PROD =
  process.env.PROD_URL ??
  "https://nextjs-boilerplate-topaz-iota-40.vercel.app";
const ABRIL_FROM = "2026-04-01";
const ABRIL_TO = "2026-04-30";
const MAYO_FROM = "2026-05-01";
const MAYO_TO = "2026-05-31";
const ART_OFFSET = "-03:00";

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

function buildErpInRange(remitos, fromYmd, toYmd) {
  const bounds = artRangeBoundsMs(fromYmd, toYmd);
  return remitos
    .map((r) => {
      const ms = parseInstantMs(r.fechaRaw || r.fechaDisplay || r.fecha || "");
      return {
        idRemito: String(r.idRemito ?? "").trim(),
        tnOrderId: String(r.tnOrderId ?? "").trim(),
        fechaRaw: r.fechaRaw ?? "",
        totalFinal: parseAmount(r.totalFinal),
        estado: String(r.estado ?? "").trim(),
        metodoDePago: String(r.metodoDePago ?? "").trim(),
        inRange: ms != null && ms >= bounds.startMs && ms <= bounds.endMs,
      };
    })
    .filter((r) => r.inRange);
}

async function fetchErpRemitos() {
  const res = await fetch(`${PROD}/api/erp/remitos`, { cache: "no-store" });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error ?? "ERP remitos fail");
  return json.data ?? [];
}

async function fetchAnalytics(from, to) {
  const res = await fetch(`${PROD}/api/erp/analytics?from=${from}&to=${to}`, {
    cache: "no-store",
  });
  const json = await res.json();
  return json.data?.totals ?? null;
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
  return { ok: res.ok, status: res.status, json, text };
}

async function fetchTnAprilPaid() {
  const orders = [];
  for (let page = 1; page <= 50; page++) {
    const q = new URLSearchParams({
      payment_status: "paid",
      created_at_min: "2026-04-01T00:00:00.000Z",
      created_at_max: "2026-04-30T23:59:59.999Z",
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

async function fetchTnOrder(id) {
  const r = await tnFetch(`/orders/${id}`);
  return r.json;
}

loadEnv();

const remitosAll = await fetchErpRemitos();
const abrilErp = buildErpInRange(remitosAll, ABRIL_FROM, ABRIL_TO);
const mayoErp = buildErpInRange(remitosAll, MAYO_FROM, MAYO_TO);

const analyticsAbril = await fetchAnalytics(ABRIL_FROM, ABRIL_TO);
const analyticsMayo = await fetchAnalytics(MAYO_FROM, MAYO_TO);
const analyticsAbrMay = await fetchAnalytics(ABRIL_FROM, MAYO_TO);

// Duplicados abril
const byTn = new Map();
for (const r of abrilErp) {
  if (!r.tnOrderId) continue;
  if (!byTn.has(r.tnOrderId)) byTn.set(r.tnOrderId, []);
  byTn.get(r.tnOrderId).push(r);
}
const dupGroups = [...byTn.entries()]
  .filter(([, rows]) => rows.length > 1)
  .map(([tn, rows]) => {
    const sorted = [...rows].sort((a, b) => a.idRemito.localeCompare(b.idRemito));
    const extra = sorted.slice(1);
    return {
      tn,
      remitos: sorted.map((r) => ({ id: r.idRemito, total: r.totalFinal })),
      count: rows.length,
      extraFilas: extra.length,
      extraImpacto: sum(extra, (r) => r.totalFinal),
      tnUnicoValor: sorted[0].totalFinal,
    };
  });

const dupExtraFilas = sum(dupGroups, (g) => g.extraFilas);
const dupExtraMoney = sum(dupGroups, (g) => g.extraImpacto);

// TN API abril paid created UTC
console.error("Fetching TN abril...");
const tnApril = await fetchTnAprilPaid();
const tnById = new Map(tnApril.map((o) => [String(o.id), o]));
const erpTnSet = new Set(abrilErp.filter((r) => r.tnOrderId).map((r) => r.tnOrderId));

// Canceladas: remitos abril cuyo TN está cancelled/refunded
const cancelCandidates = abrilErp.filter((r) => r.tnOrderId);
const canceladas = [];
for (const r of cancelCandidates) {
  let o = tnById.get(r.tnOrderId);
  if (!o) {
    try {
      o = await fetchTnOrder(r.tnOrderId);
      await new Promise((x) => setTimeout(x, 100));
    } catch {
      o = null;
    }
  }
  if (!o) continue;
  const st = String(o.status ?? "").toLowerCase();
  const ps = String(o.payment_status ?? "").toLowerCase();
  if (
    st === "cancelled" ||
    st === "canceled" ||
    ps === "refunded" ||
    ps === "voided"
  ) {
    canceladas.push({
      tn: r.tnOrderId,
      idRemito: r.idRemito,
      totalFinal: r.totalFinal,
      estado: r.estado,
      tnStatus: o.status,
      tnPaymentStatus: o.payment_status,
    });
  }
}

// ERP sin TN en abril paid list
const erpNotInTnList = abrilErp.filter(
  (r) => r.tnOrderId && !tnById.has(r.tnOrderId)
);

// Dedup consolidado
const dedupFirst = new Map();
for (const r of abrilErp) {
  if (!r.tnOrderId) continue;
  const ex = dedupFirst.get(r.tnOrderId);
  if (!ex || r.idRemito < ex.idRemito) dedupFirst.set(r.tnOrderId, r);
}
const dedupSum = sum([...dedupFirst.values()], (r) => r.totalFinal);

const report = {
  generatedAt: new Date().toISOString(),
  panelReported: {
    abrilMayoVentas: 812,
    abrilMayoFacturacion: 106176180,
  },
  erpReported: {
    abrilMayoRemitos: 824,
    abrilMayoFacturacion: 107691110,
    deltaRemitos: 12,
    deltaFacturacion: 107691110 - 106176180,
  },
  abril: {
    remitos: abrilErp.length,
    tnUnicos: byTn.size,
    sinTnOrderId: abrilErp.filter((r) => !r.tnOrderId).length,
    facturacionTotalFinal: sum(abrilErp, (r) => r.totalFinal),
    analyticsOrdenes: analyticsAbril?.ordenesTotales,
    analyticsFacturacion: analyticsAbril?.facturacionTotal,
    gruposDuplicados: dupGroups.length,
    filasDuplicadasExtra: dupExtraFilas,
    impactoDuplicadosExtra: dupExtraMoney,
    facturacionDedupConsolidado: dedupSum,
    canceladas: {
      count: canceladas.length,
      impacto: sum(canceladas, (c) => c.totalFinal),
      rows: canceladas,
    },
    erpTnNoEnListaPaidAbril: {
      count: erpNotInTnList.length,
      impacto: sum(erpNotInTnList, (r) => r.totalFinal),
      rows: erpNotInTnList.map((r) => ({
        idRemito: r.idRemito,
        tn: r.tnOrderId,
        total: r.totalFinal,
      })),
    },
    tnApiPaidCreatedAbrilUtc: tnApril.length,
    tnApiGross: sum(tnApril, (o) => parseAmount(o.total)),
  },
  mayo: {
    remitos: mayoErp.length,
    analyticsOrdenes: analyticsMayo?.ordenesTotales,
    analyticsFacturacion: analyticsMayo?.facturacionTotal,
  },
  abrilMayo: {
    analyticsOrdenes: analyticsAbrMay?.ordenesTotales,
    analyticsFacturacion: analyticsAbrMay?.facturacionTotal,
    sumAbrilMayoRemitos: abrilErp.length + mayoErp.length,
    sumAbrilMayoFacturacion:
      sum(abrilErp, (r) => r.totalFinal) + sum(mayoErp, (r) => r.totalFinal),
  },
  duplicadosAbril: dupGroups,
  reconciliacion12: {
    deltaPanelVsErp: 824 - 812,
    abrilExtraFilasVsUnicos: abrilErp.length - byTn.size,
    mayoExtraFilasVsUnicos: mayoErp.length - new Set(mayoErp.map((r) => r.tnOrderId).filter(Boolean)).size,
    abrilDupExtra: dupExtraFilas,
    mayoDupExtraHistorico: 12,
    hipotesis:
      "Los 12 remitos extra Abril+Mayo = dup abril + dup mayo (pre-E.1) + canceladas",
  },
};

const out = path.join(process.cwd(), "_wip/fase-g-abril-audit.json");
fs.writeFileSync(out, JSON.stringify(report, null, 2));

console.log("=== FASE G — Abril ===\n");
console.table({
  Abril: "",
  remitos: report.abril.remitos,
  tnUnicos: report.abril.tnUnicos,
  duplicados_grupos: report.abril.gruposDuplicados,
  duplicados_filas_extra: report.abril.filasDuplicadasExtra,
  canceladas: report.abril.canceladas.count,
  "impacto_dup_$": Math.round(report.abril.impactoDuplicadosExtra),
  "impacto_cancel_$": Math.round(report.abril.canceladas.impacto),
  facturacion: Math.round(report.abril.facturacionTotalFinal),
  analytics_remitos: report.abril.analyticsOrdenes,
});

console.log("\n=== Abril+Mayo reconciliación ===");
console.table({
  ERP_remitos: report.abrilMayo.sumAbrilMayoRemitos,
  ERP_facturacion: Math.round(report.abrilMayo.sumAbrilMayoFacturacion),
  analytics_remitos: report.abrilMayo.analyticsOrdenes,
  analytics_facturacion: Math.round(report.abrilMayo.analyticsFacturacion),
  panel_ventas: 812,
  panel_$: 106176180,
  delta_remitos: 824 - 812,
  abril_extra_filas: report.abril.remitos - report.abril.tnUnicos,
  mayo_extra_filas: report.mayo.remitos - 464,
});

console.log("\nDuplicados abril (detalle):");
console.table(
  dupGroups.map((g) => ({
    tn: g.tn,
    remitos: g.count,
    extra$: g.extraImpacto,
    ids: g.remitos.map((r) => r.id).join(" | "),
  }))
);

if (canceladas.length) {
  console.log("\nCanceladas en ERP abril:");
  console.table(canceladas);
}

console.log("\nJSON:", out);
