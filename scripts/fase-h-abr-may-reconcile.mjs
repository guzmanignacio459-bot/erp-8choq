#!/usr/bin/env node
/**
 * FASE H — Reconciliación Abril+Mayo ERP vs TN panel (read-only).
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
const PANEL = { ventas: 812, facturacion: 106176180 };

const BOUNDARY_TNS = new Set([
  "1948850440", "1955282193", "1958563205", "1958557074",
  "1958543048", "1958533879", "1958523399",
]);
const CUSTOM_JUN_TNS = new Set([
  "1979195700", "1983697166", "1983819814", "1982603797",
]);
const GIFTY_TNS = new Set(["1981026616", "1980843190"]);
const CANCEL_ABRIL_TN = "1955271645";

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

function artDay(ms) {
  if (ms == null) return "";
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(ms));
  const g = (t) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}`;
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

function inRange(ms, from, to) {
  const b = artRangeBoundsMs(from, to);
  return ms >= b.startMs && ms <= b.endMs;
}

async function fetchErpRemitos() {
  const res = await fetch(`${PROD}/api/erp/remitos`, { cache: "no-store" });
  const json = await res.json();
  return json.data ?? [];
}

async function fetchAnalytics(from, to) {
  const res = await fetch(`${PROD}/api/erp/analytics?from=${from}&to=${to}`, {
    cache: "no-store",
  });
  const json = await res.json();
  return json.data?.totals;
}

async function tnFetch(path) {
  const STORE = process.env.TIENDANUBE_STORE_ID;
  const TOKEN = process.env.TIENDANUBE_ACCESS_TOKEN;
  const UA = process.env.TIENDANUBE_USER_AGENT || "8Q ERP";
  const BASE = process.env.TIENDANUBE_API_URL?.trim() || "https://api.tiendanube.com/v1";
  const res = await fetch(`${BASE}/${STORE}${path}`, {
    headers: { Authentication: `bearer ${TOKEN}`, "User-Agent": UA },
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* ignore */
  }
  return { ok: res.ok, json };
}

async function fetchTnOrders(min, max) {
  const orders = [];
  for (let page = 1; page <= 60; page++) {
    const q = new URLSearchParams({
      payment_status: "paid",
      created_at_min: min,
      created_at_max: max,
      page: String(page),
      per_page: "200",
    });
    const r = await tnFetch(`/orders?${q}`);
    if (!r.ok) break;
    const batch = Array.isArray(r.json) ? r.json : [];
    if (!batch.length) break;
    orders.push(...batch);
    if (batch.length < 200) break;
    await new Promise((x) => setTimeout(x, 120));
  }
  return orders;
}

async function tnOrder(id) {
  const r = await tnFetch(`/orders/${id}`);
  return r.json;
}

function classifyErpRemito(r, tnMap) {
  const tn = r.tnOrderId;
  const o = tn ? tnMap.get(tn) : null;
  let cat = "match_normal";

  if (tn === CANCEL_ABRIL_TN) cat = "cancelada_abril";
  else if (BOUNDARY_TNS.has(tn)) cat = "boundary_timezone";
  else if (GIFTY_TNS.has(tn)) cat = "gifty_wallet";
  else if (CUSTOM_JUN_TNS.has(tn)) cat = "custom_paid_junio";
  else if (o) {
    const st = String(o.status ?? "").toLowerCase();
    const ps = String(o.payment_status ?? "").toLowerCase();
    if (st === "cancelled" || st === "canceled" || ps === "refunded" || ps === "voided")
      cat = "cancelada_otra";
    else if (o.paid_at) {
      const paidArt = artDay(parseInstantMs(o.paid_at));
      if (paidArt.startsWith("2026-06") && r.mes === "mayo") cat = "custom_paid_junio";
    }
  } else if (tn) cat = "erp_sin_tn_api";

  return { ...r, categoria: cat, tnOrder: o };
}

loadEnv();

const remitosRaw = await fetchErpRemitos();
const boundsAbr = artRangeBoundsMs(ABRIL_FROM, ABRIL_TO);
const boundsMay = artRangeBoundsMs(MAYO_FROM, MAYO_TO);

const erpAbrMay = remitosRaw
  .map((r) => {
    const ms = parseInstantMs(r.fechaRaw || r.fecha || "");
    const inAbr = ms != null && ms >= boundsAbr.startMs && ms <= boundsAbr.endMs;
    const inMay = ms != null && ms >= boundsMay.startMs && ms <= boundsMay.endMs;
    if (!inAbr && !inMay) return null;
    return {
      idRemito: String(r.idRemito ?? "").trim(),
      tnOrderId: String(r.tnOrderId ?? "").trim(),
      totalFinal: parseAmount(r.totalFinal),
      fechaRaw: r.fechaRaw ?? "",
      mes: inAbr ? "abril" : "mayo",
      estado: String(r.estado ?? "").trim(),
    };
  })
  .filter(Boolean);

console.error("Fetching TN orders abr+may...");
const tnOrders = await fetchTnOrders(
  "2026-04-01T00:00:00.000Z",
  "2026-05-31T23:59:59.999Z"
);
const tnMap = new Map(tnOrders.map((o) => [String(o.id), o]));

// Enrich missing TNs (cancel, custom jun not in paid list)
for (const tn of [
  CANCEL_ABRIL_TN,
  ...BOUNDARY_TNS,
  ...CUSTOM_JUN_TNS,
  ...GIFTY_TNS,
  "1972290115",
]) {
  if (!tnMap.has(tn)) {
    try {
      const o = await tnOrder(tn);
      if (o?.id) tnMap.set(String(o.id), o);
      await new Promise((x) => setTimeout(x, 80));
    } catch {
      /* ignore */
    }
  }
}

const classified = erpAbrMay.map((r) => classifyErpRemito(r, tnMap));

// Aggregate ERP adjustments (ERP has, panel likely doesn't)
const erpOnlyCats = [
  "cancelada_abril",
  "cancelada_otra",
  "boundary_timezone",
  "gifty_wallet",
  "erp_sin_tn_api",
];
// boundary in ERP abril - panel may count differently; treat as ERP-side classification
// custom_paid_junio should NOT be in ERP currently

const byCat = {};
for (const r of classified) {
  const c = r.categoria;
  if (!byCat[c]) byCat[c] = [];
  byCat[c].push(r);
}

function catRow(name, rows) {
  return {
    concepto: name,
    cantidad: rows.length,
    monto: Math.round(sum(rows, (r) => r.totalFinal) * 100) / 100,
  };
}

const erpActual = {
  remitos: erpAbrMay.length,
  facturacion: sum(erpAbrMay, (r) => r.totalFinal),
};

const analytics = await fetchAnalytics(ABRIL_FROM, MAYO_TO);

// TN orders paid created abr-may UTC - panel proxy
const tnPaidCreated = tnOrders.filter((o) => {
  const st = String(o.status ?? "").toLowerCase();
  const ps = String(o.payment_status ?? "").toLowerCase();
  return !(st === "cancelled" || ps === "refunded" || ps === "voided");
});
const tnGross = sum(tnPaidCreated, (o) => parseAmount(o.total));

// TN in API but NOT in ERP (missing remitos)
const erpTnSet = new Set(erpAbrMay.map((r) => r.tnOrderId).filter(Boolean));
const tnMissingErp = tnPaidCreated.filter((o) => !erpTnSet.has(String(o.id)));

// Classify missing TN
const tnMissingRows = [];
for (const o of tnMissingErp) {
  const id = String(o.id);
  let cat = "tn_sin_erp_otro";
  if (BOUNDARY_TNS.has(id)) cat = "boundary_sin_erp";
  else if (CUSTOM_JUN_TNS.has(id)) cat = "custom_jun_sin_erp";
  else if (GIFTY_TNS.has(id)) cat = "gifty_sin_erp"; // should be 0 post E.3
  tnMissingRows.push({
    concepto: cat,
    tn: id,
    total: parseAmount(o.total),
  });
}

const tnMissingByCat = {};
for (const r of tnMissingRows) {
  if (!tnMissingByCat[r.concepto]) tnMissingByCat[r.concepto] = [];
  tnMissingByCat[r.concepto].push(r);
}

// Build reconciliation table
const table = [];
let accCount = 0;
let accMoney = 0;

function addRow(concepto, cantidad, monto, sign = 1) {
  accCount += sign * cantidad;
  accMoney += sign * monto;
  table.push({
    concepto,
    cantidad_ordenes: cantidad,
    monto: Math.round(monto * 100) / 100,
    impacto_acum_count: accCount,
    impacto_acum_$: Math.round(accMoney * 100) / 100,
    lado: sign > 0 ? "ERP+" : "ERP-",
  });
}

addRow("ERP actual Abr+May", erpActual.remitos, erpActual.facturacion, 0);
table[table.length - 1].impacto_acum_count = erpActual.remitos;
table[table.length - 1].impacto_acum_$ = Math.round(erpActual.facturacion * 100) / 100;

// ERP adjustments (subtract from ERP toward panel)
const cancelAbr = byCat.cancelada_abril ?? [];
const cancelOtra = byCat.cancelada_otra ?? [];
const boundary = byCat.boundary_timezone ?? [];
const gifty = byCat.gifty_wallet ?? [];
const customInErp = byCat.custom_paid_junio ?? [];
const erpSinTn = byCat.erp_sin_tn_api ?? [];
const matchNormal = byCat.match_normal ?? [];

if (cancelAbr.length) addRow("− cancelada abril 1955271645", cancelAbr.length, sum(cancelAbr, (r) => r.totalFinal), -1);
if (cancelOtra.length) addRow("− otras canceladas ERP", cancelOtra.length, sum(cancelOtra, (r) => r.totalFinal), -1);
if (boundary.length) addRow("− boundary TZ (en ERP abril)", boundary.length, sum(boundary, (r) => r.totalFinal), -1);
if (gifty.length) addRow("− GIFTY wallet (panel excluye?)", gifty.length, sum(gifty, (r) => r.totalFinal), -1);
if (customInErp.length) addRow("− custom paid jun en ERP", customInErp.length, sum(customInErp, (r) => r.totalFinal), -1);
if (erpSinTn.length) addRow("− ERP sin TN API", erpSinTn.length, sum(erpSinTn, (r) => r.totalFinal), -1);

// TN missing from ERP (ERP should be lower - these are panel/TN has, ERP doesn't)
for (const [cat, rows] of Object.entries(tnMissingByCat)) {
  const label =
    cat === "boundary_sin_erp" ? "+ boundary sin remito ERP" :
    cat === "custom_jun_sin_erp" ? "+ custom jun sin remito ERP" :
    cat === "gifty_sin_erp" ? "+ GIFTY sin remito" :
    "+ TN paid sin remito ERP";
  addRow(label, rows.length, sum(rows, (r) => r.total), -1); // subtract from ERP excess perspective: panel counts these, ERP doesn't → reduces ERP vs panel gap
}

const erpAjustado = {
  remitos: erpActual.remitos - cancelAbr.length - cancelOtra.length - boundary.length - gifty.length - customInErp.length - erpSinTn.length,
  facturacion:
    erpActual.facturacion -
    sum(cancelAbr, (r) => r.totalFinal) -
    sum(cancelOtra, (r) => r.totalFinal) -
    sum(boundary, (r) => r.totalFinal) -
    sum(gifty, (r) => r.totalFinal) -
    sum(customInErp, (r) => r.totalFinal) -
    sum(erpSinTn, (r) => r.totalFinal),
};

// Alternative: ERP adjusted + TN missing should ≈ panel
const erpPlusTnMissing = {
  remitos: erpAjustado.remitos + tnMissingErp.length,
  facturacion: erpAjustado.facturacion + sum(tnMissingErp, (o) => parseAmount(o.total)),
};

const report = {
  generatedAt: new Date().toISOString(),
  erpActual,
  panel: PANEL,
  analytics,
  delta: {
    remitos: erpActual.remitos - PANEL.ventas,
    facturacion: erpActual.facturacion - PANEL.facturacion,
  },
  tnApiPaidCreatedAbrMay: tnPaidCreated.length,
  tnApiGross: tnGross,
  byCategoriaERP: Object.fromEntries(
    Object.entries(byCat).map(([k, v]) => [
      k,
      { n: v.length, $: sum(v, (r) => r.totalFinal), ids: v.map((r) => r.tnOrderId) },
    ])
  ),
  tnMissingErp: tnMissingRows,
  tabla: table,
  erpAjustado,
  erpPlusTnMissing,
  matchNormal: { n: matchNormal.length, $: sum(matchNormal, (r) => r.totalFinal) },
  verificacion: {
    panelVentas: PANEL.ventas,
    erpPlusTnMissingRemitos: erpPlusTnMissing.remitos,
    diffCount: erpPlusTnMissing.remitos - PANEL.ventas,
    panel$: PANEL.facturacion,
    erpPlusTnMissing$: erpPlusTnMissing.facturacion,
    diff$: erpPlusTnMissing.facturacion - PANEL.facturacion,
    tnApiVsPanel$: tnGross - PANEL.facturacion,
    explicado100pct:
      Math.abs(erpPlusTnMissing.remitos - PANEL.ventas) <= 2 &&
      Math.abs(erpPlusTnMissing.facturacion - PANEL.facturacion) < 500000,
  },
  detalle: {
    cancelAbril: cancelAbr,
    boundary,
    gifty,
    customJunMissing: tnMissingByCat.custom_jun_sin_erp ?? [],
    boundaryMissing: tnMissingByCat.boundary_sin_erp ?? [],
  },
};

const out = path.join(process.cwd(), "_wip/fase-h-abr-may-reconcile.json");
fs.writeFileSync(out, JSON.stringify(report, null, 2));

console.log("=== FASE H — Reconciliación ===\n");
console.table(table);
console.log("\n=== Comparación final ===");
console.table({
  ERP_actual: `${erpActual.remitos} / $${Math.round(erpActual.facturacion)}`,
  Panel_TN: `${PANEL.ventas} / $${PANEL.facturacion}`,
  Delta: `${erpActual.remitos - PANEL.ventas} / $${Math.round(erpActual.facturacion - PANEL.facturacion)}`,
  ERP_ajustado: `${erpAjustado.remitos} / $${Math.round(erpAjustado.facturacion)}`,
  "ERP_adj+TN_missing": `${erpPlusTnMissing.remitos} / $${Math.round(erpPlusTnMissing.facturacion)}`,
  TN_API_gross: `${tnPaidCreated.length} / $${Math.round(tnGross)}`,
});
console.log("\nVerificación:", report.verificacion);
console.log("JSON:", out);
