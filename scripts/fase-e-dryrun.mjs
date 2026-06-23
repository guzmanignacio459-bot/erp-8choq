#!/usr/bin/env node
/**
 * FASE E — Dry run saneamiento Mayo ERP (read-only).
 */

import fs from "fs";
import path from "path";

const PROD =
  process.env.PROD_URL ??
  "https://nextjs-boilerplate-topaz-iota-40.vercel.app";
const MAYO_FROM = "2026-05-01";
const MAYO_TO = "2026-05-31";
const ART_OFFSET = "-03:00";

const DUP_TNS = [
  "1965956866", "1966011575", "1965933254", "1965918902", "1965612099",
  "1965738678", "1945857648", "1965706208", "1965702348", "1966929851",
  "1966596806", "1965924940",
];
const CANCEL_TN = "1972290115";
const GIFTY_TNS = ["1981026616", "1980843190"];

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
  const n = parseFloat(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function hasMp(r) {
  return Boolean(
    String(r.mpPaymentId ?? "").trim() || String(r.mpStatus ?? "").trim()
  );
}

async function fetchJson(url, opts) {
  const res = await fetch(url, opts);
  const json = await res.json();
  return { ok: res.ok, status: res.status, json };
}

async function fetchRemitoDetail(idRemito) {
  const r = await fetchJson(`${PROD}/api/erp/remitos/${encodeURIComponent(idRemito)}`);
  return r.json?.data ?? null;
}

async function tnOrder(id) {
  const STORE = process.env.TIENDANUBE_STORE_ID;
  const TOKEN = process.env.TIENDANUBE_ACCESS_TOKEN;
  const UA = process.env.TIENDANUBE_USER_AGENT || "8Q ERP";
  const res = await fetch(`https://api.tiendanube.com/v1/${STORE}/orders/${id}`, {
    headers: { Authentication: `bearer ${TOKEN}`, "User-Agent": UA },
  });
  return res.json();
}

async function dryRunImport(orderId) {
  const url = `${PROD}/api/tiendanube/orders-paid/import-orders?dryRun=true`;
  const body = {
    fromISO: "2026-05-01T00:00:00.000Z",
    toISO: "2026-05-31T23:59:59.999Z",
    singleOrderId: String(orderId),
    dryRun: true,
  };
  const r = await fetchJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json;
}

loadEnv();

const bounds = {
  startMs: artDayBoundsMs(2026, 5, 1).startMs,
  endMs: artDayBoundsMs(2026, 5, 31).endMs,
};

// ERP remitos
const remitosRes = await fetchJson(`${PROD}/api/erp/remitos`);
const remitos = (remitosRes.json?.data ?? []).filter((r) => {
  const ms = parseInstantMs(r.fechaRaw || r.fecha || "");
  return ms >= bounds.startMs && ms <= bounds.endMs;
});

const analyticsRes = await fetchJson(
  `${PROD}/api/erp/analytics?from=${MAYO_FROM}&to=${MAYO_TO}`
);
const analyticsBefore = analyticsRes.json?.data?.totals ?? {};

// REMITO_ITEMS mayo
const itemsRes = await fetchJson(
  `${PROD}/api/erp/remito-items?from=${MAYO_FROM}&to=${MAYO_TO}`
);
const allItems = itemsRes.json?.data?.items ?? [];

function itemsForRemito(id) {
  return allItems.filter((i) => String(i.idRemito) === String(id));
}

// === A) Duplicados ===
const dupPlans = [];
for (const tn of DUP_TNS) {
  const rows = remitos
    .filter((r) => String(r.tnOrderId) === tn)
    .sort((a, b) => String(a.idRemito).localeCompare(String(b.idRemito)));

  if (rows.length !== 2) {
    dupPlans.push({ tn, error: `expected 2 remitos, got ${rows.length}`, rows });
    continue;
  }

  const [first, second] = rows;
  const d0 = await fetchRemitoDetail(first.idRemito);
  const d1 = await fetchRemitoDetail(second.idRemito);
  await new Promise((r) => setTimeout(r, 200));

  const mp0 = hasMp(first) || hasMp(d0 ?? {});
  const mp1 = hasMp(second) || hasMp(d1 ?? {});

  let keep, drop, reason;
  if (mp0 && !mp1) {
    keep = first;
    drop = second;
    reason = "conservar remito con MP aplicado";
  } else if (mp1 && !mp0) {
    keep = second;
    drop = first;
    reason = "conservar remito con MP aplicado";
  } else if (mp0 && mp1) {
    keep = first;
    drop = second;
    reason = "ambos con MP — conservar original (menor ID Remito); revisar manual MP duplicado";
  } else {
    keep = first;
    drop = second;
    reason = "conservar remito original (menor ID Remito / primer import)";
  }

  const dropItems = itemsForRemito(drop.idRemito);
  dupPlans.push({
    tn,
    keep: {
      idRemito: keep.idRemito,
      totalFinal: parseAmount(keep.totalFinal),
      mp: mp0 && keep === first ? { paymentId: keep.mpPaymentId, status: keep.mpStatus } : { paymentId: second.mpPaymentId, status: second.mpStatus },
      itemRows: itemsForRemito(keep.idRemito).length,
    },
    drop: {
      idRemito: drop.idRemito,
      totalFinal: parseAmount(drop.totalFinal),
      mp: drop === first ? { paymentId: first.mpPaymentId, status: first.mpStatus } : { paymentId: second.mpPaymentId, status: second.mpStatus },
      itemRows: dropItems.length,
    },
    criterio: reason,
    remitoItemsToDelete: dropItems.map((i) => ({
      idRemito: i.idRemito,
      sku: i.sku,
      talle: i.talle,
      owner: i.owner,
      precioUnitario: i.precioUnitario,
    })),
  });
}

// === B) Cancelada ===
const cancelRows = remitos.filter((r) => String(r.tnOrderId) === CANCEL_TN);
const cancelTn = await tnOrder(CANCEL_TN);
const cancelDetail = cancelRows[0]
  ? await fetchRemitoDetail(cancelRows[0].idRemito)
  : null;
const cancelItems = cancelRows[0] ? itemsForRemito(cancelRows[0].idRemito) : [];

const cancelPlan = {
  tn: CANCEL_TN,
  tnStatus: {
    status: cancelTn.status,
    payment_status: cancelTn.payment_status,
    total: parseAmount(cancelTn.total),
    created_at: cancelTn.created_at,
    paid_at: cancelTn.paid_at ?? null,
  },
  erpRemitos: cancelRows.map((r) => ({
    idRemito: r.idRemito,
    totalFinal: parseAmount(r.totalFinal),
    fecha: r.fechaRaw,
    estado: r.estado,
    mp: { paymentId: r.mpPaymentId, status: r.mpStatus },
    itemRows: itemsForRemito(r.idRemito).length,
  })),
  remitoItems: cancelItems.map((i) => ({
    idRemito: i.idRemito,
    sku: i.sku,
    talle: i.talle,
    owner: i.owner,
    articulo: i.articulo,
    precioUnitario: i.precioUnitario,
  })),
  proposeDelete: cancelTn.status === "cancelled" || cancelTn.payment_status === "refunded",
};

// === C) GIFTY ===
const giftyPlans = [];
for (const tn of GIFTY_TNS) {
  const order = await tnOrder(tn);
  const dry = await dryRunImport(tn);
  await new Promise((r) => setTimeout(r, 300));

  const products = (order.products ?? []).map((p) => ({
    sku: p.sku ?? p.variant_sku,
    name: p.name,
    qty: p.quantity,
    price: p.price,
  }));

  giftyPlans.push({
    tn,
    tnTotal: parseAmount(order.total),
    payment_method: order.payment_details?.method ?? order.payment_method,
    paid_at: order.paid_at,
    products,
    currentDryRun: {
      ok: dry.ok,
      step: dry.data?.step ?? dry.step,
      message: dry.data?.message ?? dry.message ?? dry.error,
      preview: dry.data?.preview ?? dry.preview,
    },
    proposedImport: {
      method: "singleOrderId via import-orders (post-fix GIFTY)",
      expectedTotalFinal: parseAmount(order.total),
      expectedItems: "1 fila GIFTY / talle UNICO / owner 8Q / sin descuento stock",
    },
  });
}

// Impacto
const remitosToDelete = [
  ...dupPlans.filter((p) => p.drop).map((p) => p.drop),
  ...(cancelPlan.proposeDelete ? cancelPlan.erpRemitos : []),
];
const itemsToDelete = [
  ...dupPlans.flatMap((p) => p.remitoItemsToDelete ?? []),
  ...(cancelPlan.proposeDelete ? cancelPlan.remitoItems : []),
];

const deleteMoney = remitosToDelete.reduce((s, r) => s + (r.totalFinal ?? parseAmount(r.totalFinal)), 0);
const importMoney = giftyPlans.reduce((s, g) => s + g.tnTotal, 0);

const impact = {
  antes: {
    remitos: analyticsBefore.ordenesTotales,
    facturacion: analyticsBefore.facturacionTotal,
  },
  eliminar: {
    remitos: remitosToDelete.length,
    facturacion: deleteMoney,
    items: itemsToDelete.length,
  },
  importar: {
    ordenes: giftyPlans.length,
    facturacion: importMoney,
    remitosNuevos: giftyPlans.length,
    itemsEstimados: giftyPlans.length, // 1 GIFTY c/u
  },
  despues: {
    remitos: analyticsBefore.ordenesTotales - remitosToDelete.length + giftyPlans.length,
    facturacion:
      analyticsBefore.facturacionTotal - deleteMoney + importMoney,
  },
  deltaFacturacion: -deleteMoney + importMoney,
  deltaRemitos: -remitosToDelete.length + giftyPlans.length,
};

const report = {
  generatedAt: new Date().toISOString(),
  mode: "DRY_RUN_ONLY",
  duplicados: dupPlans,
  cancelada: cancelPlan,
  gifty: giftyPlans,
  resumen: {
    remitosAEliminar: remitosToDelete.map((r) => ({
      idRemito: r.idRemito,
      totalFinal: r.totalFinal ?? parseAmount(r.totalFinal),
      tn: r.tn ?? undefined,
    })),
    remitoItemsAEliminar: itemsToDelete.length,
    ordenesAImportar: GIFTY_TNS,
    impact,
    riesgos: [
      "Eliminación física de filas REMITOS/REMITO_ITEMS requiere operación manual en Sheets o endpoint GAS (no existe deleteRemito hoy).",
      "Verificar que remito conservado en duplicados tenga MP correcto antes de borrar hermano.",
      "GIFTY fix requiere deploy de import-orders (cambio mínimo en expandOrderItemsToUnitRows) — no incluido en este dry run.",
      "Import puntual GIFTY no ejecuta MP (wallet) — coherente con restricción NO tocar MP.",
      "Cancelada 1972290115: si tenía stock descontado al importar, eliminar remito no revierte stock automáticamente.",
    ],
    giftyCodeFix: {
      file: "app/api/tiendanube/orders-paid/import-orders/route.ts",
      function: "expandOrderItemsToUnitRows",
      change:
        "Si sku === 'GIFTY' (sin talle en VALID_SIZES): usar talle='UNICO', owner='', skip stock real, crear 1 item con articulo desde TN name.",
      lines: "343-346",
    },
  },
};

const out = path.join(process.cwd(), "_wip/fase-e-dryrun.json");
fs.writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.error("\nWrote", out);
