#!/usr/bin/env node
/**
 * FASE C — Reconciliar TN Analytics panel vs TN API (read-only).
 */

import fs from "fs";
import path from "path";

function loadEnv() {
  const p = path.join(process.cwd(), ".env.local");
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}
loadEnv();

const STORE = process.env.TIENDANUBE_STORE_ID;
const TOKEN = process.env.TIENDANUBE_ACCESS_TOKEN;
const UA = process.env.TIENDANUBE_USER_AGENT || "8Q ERP";
const BASE = "https://api.tiendanube.com/v1";
const TZ = "America/Argentina/Buenos_Aires";
const MAYO_START_ART = Date.parse("2026-05-01T03:00:00.000Z");
const MAYO_END_ART = Date.parse("2026-06-01T02:59:59.999Z");
const PANEL_N = 453;
const PANEL_AMT = 56684405;

const num = (v) => {
  if (v == null || v === "") return 0;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const parseMs = (iso) => {
  const raw = String(iso ?? "").trim();
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
};
const artDay = (ms) => {
  if (ms == null) return "";
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(ms));
  const g = (t) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}`;
};
const inMayoArt = (ms) => ms != null && ms >= MAYO_START_ART && ms <= MAYO_END_ART;

async function fetchPaidMayo() {
  const orders = [];
  for (let page = 1; page <= 50; page++) {
    const q = new URLSearchParams({
      payment_status: "paid",
      created_at_min: "2026-05-01T00:00:00.000Z",
      created_at_max: "2026-05-31T23:59:59.999Z",
      page: String(page),
      per_page: "200",
    });
    const res = await fetch(`${BASE}/${STORE}/orders?${q}`, {
      headers: { Authentication: `bearer ${TOKEN}`, "User-Agent": UA },
    });
    const j = await res.json();
    if (!Array.isArray(j) || !j.length) break;
    orders.push(...j);
    if (j.length < 200) break;
    await new Promise((r) => setTimeout(r, 150));
  }
  return orders;
}

const sumField = (list, field) => list.reduce((a, o) => a + o[field], 0);
const score = (n, amt) => ({
  n,
  amt: Math.round(amt * 100) / 100,
  diffN: n - PANEL_N,
  diffAmt: Math.round((amt - PANEL_AMT) * 100) / 100,
  dist: Math.abs(n - PANEL_N) * 10000 + Math.abs(amt - PANEL_AMT),
});

const raw = await fetchPaidMayo();
console.error(`Fetched ${raw.length} orders`);

const orders = raw.map((o) => {
  const createdMs = parseMs(o.created_at);
  const paidMs = parseMs(o.paid_at);
  const shipCust = num(o.shipping_cost_customer);
  const shipOwner = num(o.shipping_cost_owner);
  const total = num(o.total);
  const subtotal = num(o.subtotal);
  const discount = num(o.discount ?? o.discount_total ?? o.total_discounts);
  const coupon = num(o.coupon?.value ?? o.coupon_amount ?? 0);
  const method = String(o.payment_details?.method ?? o.payment_method ?? "").toLowerCase();
  const gateway = String(o.gateway ?? "").toLowerCase();

  return {
    id: String(o.id),
    total,
    subtotal,
    discount,
    coupon,
    shipCust,
    shipOwner,
    totalMinusShipCust: total - shipCust,
    subtotalMinusDiscount: subtotal - discount,
    totalMinusAllShipping: total - shipCust - shipOwner,
    createdMs,
    paidMs,
    createdArt: artDay(createdMs),
    paidArt: paidMs ? artDay(paidMs) : "",
    inCreatedArtMayo: inMayoArt(createdMs),
    inPaidArtMayo: paidMs != null && inMayoArt(paidMs),
    method,
    gateway,
    payment_status: String(o.payment_status ?? ""),
    status: String(o.status ?? ""),
    hasShipping: shipCust > 0.01 || shipOwner > 0.01,
    isCustom: method === "custom" || gateway === "offline",
    isWallet: method === "wallet",
    isCredit: method === "credit_card",
    isDebit: method === "debit_card",
  };
});

const hypotheses = [];
function add(name, category, list, amtField = "total") {
  hypotheses.push({ criterio: name, categoria: category, ...score(list.length, sumField(list, amtField)) });
}

add("ALL 475 | SUM(total)", "baseline", orders, "total");
add("ALL 475 | SUM(total - shipping_customer)", "baseline", orders, "totalMinusShipCust");
add("ALL 475 | SUM(subtotal)", "baseline", orders, "subtotal");
add("ALL 475 | SUM(subtotal - discount)", "baseline", orders, "subtotalMinusDiscount");

const createdArt = orders.filter((o) => o.inCreatedArtMayo);
const paidArt = orders.filter((o) => o.inPaidArtMayo);
const boundary = orders.filter((o) => !o.inCreatedArtMayo);
const customPaidJun = orders.filter((o) => o.isCustom && o.paidArt === "2026-06-01");
const walletOrders = orders.filter((o) => o.isWallet);
const customOrders = orders.filter((o) => o.isCustom);

add("created_at ART Mayo | SUM(total)", "fecha", createdArt, "total");
add("created_at ART Mayo | SUM(total-ship)", "fecha", createdArt, "totalMinusShipCust");
add("paid_at ART Mayo | SUM(total)", "fecha", paidArt, "total");
add("paid_at ART Mayo | SUM(total-ship)", "fecha", paidArt, "totalMinusShipCust");

const panelDateProxy = orders.filter((o) => inMayoArt(o.paidMs ?? o.createdMs));
add("coalesce(paid,created) ART Mayo | SUM(total-ship)", "fecha", panelDateProxy, "totalMinusShipCust");

add("excl boundary UTC/ART (7) | SUM(total-ship)", "timezone", orders.filter((o) => o.inCreatedArtMayo), "totalMinusShipCust");
add("excl paid_at fuera Mayo ART | SUM(total-ship)", "fecha", orders.filter((o) => !(o.paidMs && !o.inPaidArtMayo)), "totalMinusShipCust");
add("excl custom | SUM(total-ship)", "metodo_pago", orders.filter((o) => !o.isCustom), "totalMinusShipCust");
add("excl wallet | SUM(total-ship)", "metodo_pago", orders.filter((o) => !o.isWallet), "totalMinusShipCust");
add("excl custom+wallet | SUM(total-ship)", "metodo_pago", orders.filter((o) => !o.isCustom && !o.isWallet), "totalMinusShipCust");
add("solo credit+debit | SUM(total-ship)", "metodo_pago", orders.filter((o) => o.isCredit || o.isDebit), "totalMinusShipCust");
add("sin envío cliente (ship=0) | SUM(total)", "envio", orders.filter((o) => o.shipCust <= 0.01), "total");

const candidates453 = [];
function tryExclude(name, excluded, category = "match_453") {
  const set = new Set(excluded.map((o) => o.id));
  const kept = orders.filter((o) => !set.has(o.id));
  if (kept.length !== PANEL_N) return;
  for (const field of ["total", "totalMinusShipCust", "subtotalMinusDiscount"]) {
    candidates453.push({
      criterio: `${name} | SUM(${field})`,
      categoria: category,
      ...score(kept.length, sumField(kept, field)),
    });
  }
}

tryExclude("excl boundary(7)", boundary);
tryExclude("excl wallet(2)", walletOrders);
tryExclude("excl custom paid jun(4)", customPaidJun);
tryExclude("excl boundary+wallet", [...boundary, ...walletOrders]);
tryExclude("excl boundary+wallet+customPaidJun", [...boundary, ...walletOrders, ...customPaidJun]);

const gifty = orders.filter((o) => o.id === "1981026616" || o.id === "1980843190");
const base13 = [...boundary, ...walletOrders, ...customPaidJun];
const need9 = 475 - PANEL_N - base13.length;
if (need9 >= 0) {
  const rest = orders.filter((o) => !base13.some((x) => x.id === o.id));
  const ex9ship = [...rest].sort((a, b) => b.shipCust - a.shipCust).slice(0, need9);
  tryExclude("excl boundary+wallet+customJun+top9ship", [...base13, ...ex9ship]);
  const ex9net = [...rest].sort((a, b) => b.totalMinusShipCust - a.totalMinusShipCust).slice(0, need9);
  tryExclude("excl boundary+wallet+customJun+top9net", [...base13, ...ex9net]);
}

// created ART excl 15 to reach 453
if (createdArt.length === 468) {
  const ex15paidJun = createdArt.filter((o) => o.paidArt === "2026-06-01");
  tryExclude("created ART excl paid jun(15?)", ex15paidJun.length === 15 ? ex15paidJun : createdArt.filter((o) => !o.inPaidArtMayo && o.paidMs));
  tryExclude("created ART excl paid jun custom(4)+wallet(2)+boundary overlap", [
    ...createdArt.filter((o) => o.paidArt === "2026-06-01"),
    ...walletOrders,
  ]);
}

// Greedy: find 22 orders to exclude minimizing amount error for totalMinusShipCust
function greedyExclude22() {
  const targetAmt = PANEL_AMT;
  const mustExcl = new Set([...boundary, ...walletOrders, ...customPaidJun].map((o) => o.id));
  let remaining = orders.filter((o) => !mustExcl.has(o.id));
  const need = 475 - PANEL_N - mustExcl.size;
  if (need < 0) return null;
  const picked = [];
  let current = orders.filter((o) => !mustExcl.has(o.id));
  let currentSum = sumField(current, "totalMinusShipCust");
  const pool = [...remaining];
  for (let i = 0; i < need && pool.length; i++) {
    let best = null;
    let bestScore = Infinity;
    for (const o of pool) {
      const newSum = currentSum - o.totalMinusShipCust;
      const newN = current.length - 1;
      const dist = Math.abs(newN - PANEL_N) * 10000 + Math.abs(newSum - targetAmt);
      if (dist < bestScore) {
        bestScore = dist;
        best = o;
      }
    }
    if (!best) break;
    picked.push(best);
    currentSum -= best.totalMinusShipCust;
    current = current.filter((x) => x.id !== best.id);
    const idx = pool.findIndex((x) => x.id === best.id);
    pool.splice(idx, 1);
  }
  return { picked, kept: current, sum: currentSum, mustExcl: [...mustExcl] };
}
const greedy = greedyExclude22();
if (greedy && greedy.kept.length === PANEL_N) {
  candidates453.push({
    criterio: "GREEDY: excl boundary+wallet+customJun + 9 órdenes (optimiza neto)",
    categoria: "match_453_greedy",
    ...score(greedy.kept.length, greedy.sum),
    excludedIds: [...greedy.mustExcl, ...greedy.picked.map((o) => o.id)],
  });
}

const all = [...hypotheses, ...candidates453]
  .sort((a, b) => a.dist - b.dist)
  .map((h, i) => ({
    rank: i + 1,
    ...h,
    conclusion:
      h.dist < 100000
        ? "MATCH FUERTE"
        : h.dist < 800000
          ? "MATCH PARCIAL"
          : h.n === PANEL_N
            ? "COUNT EXACTO, $ con desvío"
            : Math.abs(h.diffAmt) < 600000
              ? "$ relativamente cerca"
              : "DESCARTADA",
  }));

console.log("=== TOP 20 HIPÓTESIS ===");
console.table(
  all.slice(0, 20).map((h) => ({
    rank: h.rank,
    criterio: h.criterio.slice(0, 72),
    ordenes: h.n,
    facturacion: h.amt,
    diffN: h.diffN,
    diff$: h.diffAmt,
    conclusion: h.conclusion,
  }))
);

console.log("\n=== EXACTAMENTE 453 ÓRDENES ===");
console.table(
  all.filter((h) => h.n === PANEL_N).slice(0, 12).map((h) => ({
    criterio: h.criterio.slice(0, 80),
    facturacion: h.amt,
    diff$: h.diffAmt,
    dist: Math.round(h.dist),
  }))
);

const byMethod = {};
for (const o of orders) {
  const k = o.method || "unknown";
  if (!byMethod[k]) byMethod[k] = [];
  byMethod[k].push(o);
}

console.log("\n=== POR MÉTODO DE PAGO ===");
console.table(
  Object.fromEntries(
    Object.entries(byMethod).map(([k, v]) => [
      k,
      { n: v.length, total: Math.round(sumField(v, "total")), net: Math.round(sumField(v, "totalMinusShipCust")) },
    ])
  )
);

console.log("\n=== UNIVERSO ===");
console.table({
  apiOrders: orders.length,
  sumTotal: sumField(orders, "total"),
  sumNet: sumField(orders, "totalMinusShipCust"),
  createdArt: createdArt.length,
  paidArt: paidArt.length,
  boundary: boundary.length,
  custom: customOrders.length,
  wallet: walletOrders.length,
  customPaidJun: customPaidJun.length,
  panel: `${PANEL_N} / ${PANEL_AMT}`,
});

const outPath = path.join(process.cwd(), "_wip/fase-c-tn-analytics-reconcile.json");
fs.writeFileSync(
  outPath,
  JSON.stringify({ panel: { n: PANEL_N, amt: PANEL_AMT }, ranking: all.slice(0, 50), greedy, byMethod: Object.fromEntries(Object.entries(byMethod).map(([k,v])=>[k,{n:v.length,total:sumField(v,'total'),net:sumField(v,'totalMinusShipCust')}])) }, null, 2)
);
console.log("\nJSON:", outPath);
