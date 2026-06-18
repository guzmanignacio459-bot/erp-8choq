#!/usr/bin/env node
/**
 * FASE J.5B — Reconciliación Junio 01–08: TN panel vs TN API vs ERP (read-only)
 */

import fs from "fs";
import path from "path";

const PROD =
  process.env.PROD_URL ??
  "https://nextjs-boilerplate-topaz-iota-40.vercel.app";
const JUN_FROM = "2026-06-01";
const JUN_TO = "2026-06-08";
const TZ = "America/Argentina/Buenos_Aires";
const ART_OFFSET = "-03:00";

const PANEL = { ventas: 90, facturacion: 11979247 };
const ERP_REF = { remitos: 72, facturacion: 9746231 }; // post J.3 import jun 01-06
const TN_PREV_AUDIT = { ordenes: 66, scope: "paid created jun 01-06" };

function loadEnv() {
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}
loadEnv();

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
    timeZone: TZ,
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

function tnTotal(o) {
  return parseAmount(o.total ?? o.total_price ?? 0);
}

function tnNet(o) {
  const ship = parseAmount(o.shipping_cost_customer ?? 0);
  return tnTotal(o) - ship;
}

function sum(list, fn) {
  return list.reduce((a, x) => a + fn(x), 0);
}

async function tnFetch(apiPath) {
  const STORE = process.env.TIENDANUBE_STORE_ID;
  const TOKEN = process.env.TIENDANUBE_ACCESS_TOKEN;
  const UA = process.env.TIENDANUBE_USER_AGENT || "8Q ERP";
  const BASE = process.env.TIENDANUBE_API_URL?.trim() || "https://api.tiendanube.com/v1";
  const res = await fetch(`${BASE}/${STORE}${apiPath}`, {
    headers: { Authentication: `bearer ${TOKEN}`, "User-Agent": UA },
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* ignore */
  }
  return { ok: res.ok, status: res.status, text, json };
}

async function fetchTnOrders(params, maxPages = 80) {
  const orders = [];
  for (let page = 1; page <= maxPages; page++) {
    const q = new URLSearchParams({
      ...params,
      page: String(page),
      per_page: "200",
    });
    const r = await tnFetch(`/orders?${q}`);
    if (!r.ok && /Last page is/.test(r.text)) break;
    if (!r.ok) throw new Error(`TN ${page}: ${r.status} ${r.text.slice(0, 150)}`);
    const batch = Array.isArray(r.json) ? r.json : [];
    if (!batch.length) break;
    orders.push(...batch);
    if (batch.length < 200) break;
    await new Promise((x) => setTimeout(x, 120));
  }
  return orders;
}

function normalizeOrder(o) {
  const createdMs = parseInstantMs(o.created_at);
  const paidMs = parseInstantMs(o.paid_at);
  const bounds = artRangeBoundsMs(JUN_FROM, JUN_TO);
  const bounds06 = artRangeBoundsMs(JUN_FROM, "2026-06-06");
  return {
    id: String(o.id),
    total: tnTotal(o),
    net: tnNet(o),
    createdMs,
    paidMs,
    createdArt: artDay(createdMs),
    paidArt: paidMs ? artDay(paidMs) : "",
    inCreatedArtJun: createdMs != null && createdMs >= bounds.startMs && createdMs <= bounds.endMs,
    inPaidArtJun: paidMs != null && paidMs >= bounds.startMs && paidMs <= bounds.endMs,
    inCreatedArtJun06: createdMs != null && createdMs >= bounds06.startMs && createdMs <= bounds06.endMs,
    inPaidArtJun06: paidMs != null && paidMs >= bounds06.startMs && paidMs <= bounds06.endMs,
    payment_status: String(o.payment_status ?? "").toLowerCase(),
    status: String(o.status ?? "").toLowerCase(),
    gateway: String(o.gateway ?? ""),
    method: String(o.payment_details?.method ?? o.payment_method ?? "").toLowerCase(),
  };
}

function groupBy(arr, keyFn) {
  const m = {};
  for (const x of arr) {
    const k = keyFn(x) || "(vacío)";
    if (!m[k]) m[k] = [];
    m[k].push(x);
  }
  return Object.fromEntries(
    Object.entries(m)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => [k, { count: v.length, total: Math.round(sum(v, (x) => x.total)), net: Math.round(sum(v, (x) => x.net)) }])
  );
}

function listSummary(list) {
  return {
    count: list.length,
    total: Math.round(sum(list, (x) => x.total) * 100) / 100,
    net: Math.round(sum(list, (x) => x.net) * 100) / 100,
  };
}

function diffSets(aIds, bIds) {
  const a = new Set(aIds);
  const b = new Set(bIds);
  return {
    onlyA: [...a].filter((id) => !b.has(id)),
    onlyB: [...b].filter((id) => !a.has(id)),
    both: [...a].filter((id) => b.has(id)),
  };
}

function moneyForIds(orders, ids) {
  const set = new Set(ids);
  const rows = orders.filter((o) => set.has(o.id));
  return { ...listSummary(rows), ids: rows.map((o) => o.id) };
}

// --- fetch ---
console.error("Fetching TN all created jun 01-08...");
const allRaw = await fetchTnOrders({
  created_at_min: "2026-06-01T00:00:00.000Z",
  created_at_max: "2026-06-08T23:59:59.999Z",
});

console.error("Fetching TN paid created jun 01-08...");
const paidCreatedRaw = await fetchTnOrders({
  payment_status: "paid",
  created_at_min: "2026-06-01T00:00:00.000Z",
  created_at_max: "2026-06-08T23:59:59.999Z",
});

console.error("Fetching TN paid created jun 01-06 (prev audit)...");
const paidCreated0606Raw = await fetchTnOrders({
  payment_status: "paid",
  created_at_min: "2026-06-01T00:00:00.000Z",
  created_at_max: "2026-06-06T23:59:59.999Z",
});

console.error("Fetching ERP remitos...");
const erpRes = await fetch(`${PROD}/api/erp/remitos`, { cache: "no-store" });
const erpJson = await erpRes.json();
const erpAll = erpJson.data ?? [];

const junBounds = artRangeBoundsMs(JUN_FROM, JUN_TO);
const jun06Bounds = artRangeBoundsMs(JUN_FROM, "2026-06-06");

const erpJun08 = erpAll
  .map((r) => {
    const ms = parseInstantMs(r.fechaRaw || r.fechaDisplay || "");
    return {
      idRemito: String(r.idRemito ?? ""),
      tnOrderId: String(r.tnOrderId ?? "").trim(),
      totalFinal: parseAmount(r.totalFinal),
      fechaArt: ms != null ? artDay(ms) : "",
      fechaMs: ms,
      estado: String(r.estado ?? ""),
      metodoDePago: String(r.metodoDePago ?? ""),
    };
  })
  .filter((r) => r.fechaMs != null && r.fechaMs >= junBounds.startMs && r.fechaMs <= junBounds.endMs);

const erpJun06 = erpJun08.filter(
  (r) => r.fechaMs >= jun06Bounds.startMs && r.fechaMs <= jun06Bounds.endMs
);

const all = allRaw.map(normalizeOrder);
const paidCreated = paidCreatedRaw.map(normalizeOrder);
const paidCreated0606 = paidCreated0606Raw.map(normalizeOrder);

// paid + created ART
const paidCreatedArt = paidCreated.filter((o) => o.inCreatedArtJun);
// paid + paid_at ART
const paidPaidArt = paidCreated.filter((o) => o.inPaidArtJun);
// panel proxy hypotheses
const panelProxyPaidCoalesce = paidCreated.filter((o) => {
  const ms = o.paidMs ?? o.createdMs;
  return ms != null && ms >= junBounds.startMs && ms <= junBounds.endMs;
});

// all orders created ART jun
const allCreatedArt = all.filter((o) => o.inCreatedArtJun);

// Group all by status
const byPaymentStatus = groupBy(all, (o) => o.payment_status);
const byStatus = groupBy(all, (o) => o.status);

// Bridge: define panel universe candidates
const universes = {
  panel_reported: PANEL,
  tn_all_created_api: listSummary(all),
  tn_all_created_art: listSummary(allCreatedArt),
  tn_paid_created_api: listSummary(paidCreated),
  tn_paid_created_art: listSummary(paidCreatedArt),
  tn_paid_paid_at_art: listSummary(paidPaidArt),
  tn_paid_created_0106_api: listSummary(paidCreated0606),
  tn_paid_coalesce_art: listSummary(panelProxyPaidCoalesce),
  erp_jun_0108: listSummary(
    erpJun08.map((r) => ({ total: r.totalFinal, net: r.totalFinal }))
  ),
  erp_jun_0106: listSummary(
    erpJun06.map((r) => ({ total: r.totalFinal, net: r.totalFinal }))
  ),
};

// Panel match search among paid subsets
const panelCandidates = [];
function addCand(name, list, field = "total") {
  const s = listSummary(list);
  panelCandidates.push({
    name,
    count: s.count,
    amount: field === "net" ? s.net : s.total,
    diffN: s.count - PANEL.ventas,
    diff$: Math.round((field === "net" ? s.net : s.total) - PANEL.facturacion),
    dist: Math.abs(s.count - PANEL.ventas) * 10000 + Math.abs((field === "net" ? s.net : s.total) - PANEL.facturacion),
  });
}

addCand("paid API created 01-08 | total", paidCreated, "total");
addCand("paid API created 01-08 | net", paidCreated, "net");
addCand("paid created ART 01-08 | total", paidCreatedArt, "total");
addCand("paid paid_at ART 01-08 | total", paidPaidArt, "total");
addCand("paid coalesce ART 01-08 | total", panelProxyPaidCoalesce, "total");
addCand("paid coalesce ART 01-08 | net", panelProxyPaidCoalesce, "net");
addCand("all created API 01-08 | total", all, "total");
addCand("all created ART 01-08 paid only | total", allCreatedArt.filter((o) => o.payment_status === "paid"), "total");
addCand("all created ART 01-08 paid+authorized | total", allCreatedArt.filter((o) => ["paid", "authorized"].includes(o.payment_status)), "total");

panelCandidates.sort((a, b) => a.dist - b.dist);

// Best panel universe = closest to 90/11979247
const bestPanel = panelCandidates[0];

// Use paid created ART 01-08 as primary TN set for ERP bridge (or best count match)
let panelUniverse = paidCreatedArt;
if (Math.abs(paidPaidArt.length - PANEL.ventas) < Math.abs(paidCreatedArt.length - PANEL.ventas)) {
  panelUniverse = paidPaidArt;
}
// If coalesce is closer to panel count, use it
if (Math.abs(panelProxyPaidCoalesce.length - PANEL.ventas) <= Math.abs(panelUniverse.length - PANEL.ventas)) {
  panelUniverse = panelProxyPaidCoalesce;
}

// Try to find exact 90 match
const exact90 = panelCandidates.filter((c) => c.count === PANEL.ventas);

const erpTn06 = new Set(erpJun06.map((r) => r.tnOrderId).filter(Boolean));
const erpTn08 = new Set(erpJun08.map((r) => r.tnOrderId).filter(Boolean));

// Panel not ERP (use jun 01-06 ERP as user stated 72)
const panelIds = new Set(panelUniverse.map((o) => o.id));
const erpIds06 = erpTn06;
const inPanelNotErp = panelUniverse.filter((o) => !erpIds06.has(o.id));
const inErpNotPanel = erpJun06.filter((r) => r.tnOrderId && !panelIds.has(r.tnOrderId));

// Also compare panel vs paid created API 01-06 (66 audit)
const paid0606Ids = new Set(paidCreated0606.map((o) => o.id));
const inPanelNotErp06 = panelUniverse.filter((o) => !paid0606Ids.has(o.id) && !erpIds06.has(o.id));

// Bridge steps
const bridge = {
  step1_panel: { ventas: PANEL.ventas, facturacion: PANEL.facturacion },
  step2_tn_paid_created_api_0108: listSummary(paidCreated),
  step2b_tn_paid_created_api_0106: listSummary(paidCreated0606),
  step3_tn_paid_created_art_0108: listSummary(paidCreatedArt),
  step4_tn_paid_paid_at_art_0108: listSummary(paidPaidArt),
  step5_erp_jun_0106: listSummary(erpJun06.map((r) => ({ total: r.totalFinal, net: r.totalFinal }))),
  step5b_erp_jun_0108: listSummary(erpJun08.map((r) => ({ total: r.totalFinal, net: r.totalFinal }))),
  deltas: {
    panel_to_paid_api_0108: {
      count: PANEL.ventas - paidCreated.length,
      money: Math.round(PANEL.facturacion - sum(paidCreated, (o) => o.total)),
    },
    panel_to_paid_art_0108: {
      count: PANEL.ventas - paidCreatedArt.length,
      money: Math.round(PANEL.facturacion - sum(paidCreatedArt, (o) => o.total)),
    },
    paid_api_0106_to_erp_72: {
      count: paidCreated0606.length - erpJun06.length,
      money: Math.round(sum(paidCreated0606, (o) => o.total) - sum(erpJun06, (r) => r.totalFinal)),
    },
    paid_art_0108_to_erp_0106: {
      count: paidCreatedArt.length - erpJun06.length,
      money: Math.round(sum(paidCreatedArt, (o) => o.total) - sum(erpJun06, (r) => r.totalFinal)),
    },
    panel_to_erp_0106: {
      count: PANEL.ventas - erpJun06.length,
      money: Math.round(PANEL.facturacion - sum(erpJun06, (r) => r.totalFinal)),
    },
  },
};

// Categorize inPanelNotErp
const categorize = (o) => {
  if (o.payment_status !== "paid") return `payment_${o.payment_status}`;
  if (!o.inCreatedArtJun06 && o.inCreatedArtJun) return "created_jun07_08";
  if (o.paidMs && !o.inPaidArtJun06 && o.inPaidArtJun) return "paid_jun07_08";
  if (o.paidMs && o.paidArt && o.paidArt > "2026-06-08") return "paid_after_range";
  if (!o.inCreatedArtJun06 && o.inCreatedArtJun06 === false && o.createdArt >= "2026-06-06") return "boundary_date";
  return "paid_created_jun01_06_not_imported";
};

const panelNotErpCats = {};
for (const o of inPanelNotErp) {
  const c = categorize(o);
  if (!panelNotErpCats[c]) panelNotErpCats[c] = [];
  panelNotErpCats[c].push(o);
}

const erpNotPanelCats = {};
for (const r of inErpNotPanel) {
  const o = paidCreated.find((x) => x.id === r.tnOrderId) || all.find((x) => x.id === r.tnOrderId);
  let c = "erp_fecha_jun_sin_tn_panel_universe";
  if (!o) c = "erp_tn_not_in_api_created_0108";
  else if (!o.inCreatedArtJun) c = "erp_boundary_created_before_jun";
  else if (o.payment_status !== "paid") c = `erp_tn_${o.payment_status}`;
  else if (!panelIds.has(r.tnOrderId)) c = "erp_paid_outside_panel_filter";
  if (!erpNotPanelCats[c]) erpNotPanelCats[c] = [];
  erpNotPanelCats[c].push({ ...r, tn: o });
}

const report = {
  generatedAt: new Date().toISOString(),
  scope: { from: JUN_FROM, to: JUN_TO, timezone: TZ },
  panel: PANEL,
  erpReference: ERP_REF,
  tnPrevAudit: TN_PREV_AUDIT,
  universes,
  tnApiAllCreated: {
    total: listSummary(all),
    byPaymentStatus,
    byStatus,
  },
  tnPaidCreatedApi: listSummary(paidCreated),
  tnPaidCreatedArt: listSummary(paidCreatedArt),
  tnPaidPaidAtArt: listSummary(paidPaidArt),
  tnPaidCreated0106: listSummary(paidCreated0606),
  panelMatchCandidates: panelCandidates.slice(0, 15),
  exact90Candidates: exact90,
  bestPanelUniverse: bestPanel?.name,
  bridge,
  panelNotInErp: {
    summary: listSummary(inPanelNotErp),
    byCategory: Object.fromEntries(
      Object.entries(panelNotErpCats).map(([k, v]) => [k, listSummary(v)])
    ),
    orders: inPanelNotErp.map((o) => ({
      id: o.id,
      total: o.total,
      createdArt: o.createdArt,
      paidArt: o.paidArt,
      payment_status: o.payment_status,
      status: o.status,
      category: categorize(o),
    })),
  },
  erpNotInPanel: {
    summary: {
      count: inErpNotPanel.length,
      total: Math.round(sum(inErpNotPanel, (r) => r.totalFinal)),
    },
    byCategory: Object.fromEntries(
      Object.entries(erpNotPanelCats).map(([k, v]) => [
        k,
        { count: v.length, total: Math.round(sum(v, (r) => r.totalFinal)) },
      ])
    ),
    remitos: inErpNotPanel.map((r) => ({
      idRemito: r.idRemito,
      tnOrderId: r.tnOrderId,
      totalFinal: r.totalFinal,
      fechaArt: r.fechaArt,
    })),
  },
  erpJun06: {
    count: erpJun06.length,
    facturacion: Math.round(sum(erpJun06, (r) => r.totalFinal)),
  },
  erpJun08: {
    count: erpJun08.length,
    facturacion: Math.round(sum(erpJun08, (r) => r.totalFinal)),
  },
};

const out = path.join(process.cwd(), "_wip/fase-j5b-junio-reconcile.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(report, null, 2));

console.log("=== FASE J.5B — Junio 01–08 ===\n");
console.log("1. TN PANEL (reportado)");
console.table(PANEL);

console.log("\n2. TN API — todas created 01–08");
console.table({ ...listSummary(all), apiRows: allRaw.length });
console.log("Por payment_status:");
console.table(byPaymentStatus);
console.log("Por status:");
console.table(byStatus);

console.log("\n3. TN API paid (created filter API)");
console.table(listSummary(paidCreated));

console.log("\n4. TN paid + created_at ART 01–08");
console.table(listSummary(paidCreatedArt));

console.log("\n5. TN paid + paid_at ART 01–08");
console.table(listSummary(paidPaidArt));

console.log("\n6. PUENTE");
console.table(bridge);
console.log("\nPanel match TOP 8:");
console.table(panelCandidates.slice(0, 8).map((c) => ({
  criterio: c.name.slice(0, 55),
  n: c.count,
  $: c.amount,
  diffN: c.diffN,
  diff$: c.diff$,
})));

console.log("\nEn PANEL-universe y NO en ERP (jun 01-06):");
console.table({
  count: inPanelNotErp.length,
  total: Math.round(sum(inPanelNotErp, (o) => o.total)),
});
console.table(
  Object.fromEntries(
    Object.entries(panelNotErpCats).map(([k, v]) => [
      k,
      { n: v.length, $: Math.round(sum(v, (x) => x.total)) },
    ])
  )
);

console.log("\nEn ERP (jun 01-06) y NO en panel-universe:");
console.table({
  count: inErpNotPanel.length,
  total: Math.round(sum(inErpNotPanel, (r) => r.totalFinal)),
});

console.log("\nERP jun 01-06 vs 01-08");
console.table({ erp0106: report.erpJun06, erp0108: report.erpJun08 });

console.log("\nJSON:", out);
