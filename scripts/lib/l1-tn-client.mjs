/**
 * L1 — Cliente Tiendanube read-only
 */

import { loadEnvLocal } from "./l0-env.mjs";
import { inArtRange, parseInstantMs } from "./l0-art-date.mjs";
import { parseAmount } from "./l0-parse.mjs";
import {
  L1_PERIODS,
  TN_WIDE_CREATED_MAX,
  TN_WIDE_CREATED_MIN,
  tnCreatedWindowForPeriod,
} from "./l1-periods.mjs";

loadEnvLocal();

function tnConfig() {
  const store = (process.env.TIENDANUBE_STORE_ID ?? "").trim();
  const token = (process.env.TIENDANUBE_ACCESS_TOKEN ?? "").trim();
  const ua = (process.env.TIENDANUBE_USER_AGENT ?? "8Q ERP L1").trim();
  const base =
    (process.env.TIENDANUBE_API_URL ?? "https://api.tiendanube.com/v1").trim();
  if (!store || !token) {
    throw new Error("Missing TIENDANUBE_STORE_ID or TIENDANUBE_ACCESS_TOKEN");
  }
  return { store, token, ua, base };
}

async function tnFetch(apiPath) {
  const { store, token, ua, base } = tnConfig();
  const res = await fetch(`${base}/${store}${apiPath}`, {
    headers: {
      Authentication: `bearer ${token}`,
      "User-Agent": ua,
      Accept: "application/json",
    },
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

export async function fetchTnOrdersPaidRange({
  createdMin,
  createdMax,
  maxPages = 100,
} = {}) {
  const orders = [];
  for (let page = 1; page <= maxPages; page++) {
    const q = new URLSearchParams({
      payment_status: "paid",
      page: String(page),
      per_page: "200",
    });
    if (createdMin) q.set("created_at_min", createdMin);
    if (createdMax) q.set("created_at_max", createdMax);
    const r = await tnFetch(`/orders?${q}`);
    if (!r.ok && /Last page is/i.test(r.text)) break;
    if (!r.ok) {
      throw new Error(`TN page ${page}: ${r.status} ${r.text.slice(0, 200)}`);
    }
    const batch = Array.isArray(r.json) ? r.json : [];
    if (!batch.length) break;
    orders.push(...batch);
    if (batch.length < 200) break;
    await new Promise((x) => setTimeout(x, 150));
  }
  return orders;
}

/** Merge multi-window fetch — cubre paid_at boundary + por período */
export async function fetchTnOrdersL1Scope() {
  const byId = new Map();
  const allWindows = [
    { createdMin: TN_WIDE_CREATED_MIN, createdMax: TN_WIDE_CREATED_MAX },
    ...L1_PERIODS.map((p) => {
      const w = tnCreatedWindowForPeriod(p);
      return { createdMin: w.created_at_min, createdMax: w.created_at_max };
    }),
  ];

  for (const w of allWindows) {
    const batch = await fetchTnOrdersPaidRange(w);
    for (const o of batch) {
      byId.set(String(o.id), o);
    }
  }
  return [...byId.values()];
}

function mapTnLineItems(raw) {
  const products = Array.isArray(raw.products) ? raw.products : [];
  return products.map((p, idx) => {
    const qty = Math.max(1, Math.round(parseAmount(p.quantity ?? 1)));
    const unit = parseAmount(p.price ?? p.unit_price ?? 0);
    return {
      tnLineId: String(p.id ?? p.product_id ?? idx),
      sku: String(p.sku ?? p.variant?.sku ?? "").trim() || null,
      productName: String(p.name ?? p.product_name ?? "").trim() || null,
      variantName: String(p.variant_name ?? p.variant?.name ?? "").trim() || null,
      quantity: qty,
      unitPrice: unit,
      lineTotal: unit * qty,
      rawLine: p,
    };
  });
}

/** Mapea orden TN API → registro capa A */
export function mapTnOrderRecord(raw) {
  const id = String(raw.id ?? "").trim();
  if (!id) return null;

  const st = String(raw.status ?? "").toLowerCase();
  const ps = String(raw.payment_status ?? "").toLowerCase();
  const cancelled =
    st === "cancelled" ||
    st === "canceled" ||
    ps === "refunded" ||
    ps === "voided";

  const shipping =
    parseAmount(raw.shipping_cost?.customer) ||
    parseAmount(raw.shipping_cost_customer) ||
    parseAmount(raw.shipping) ||
    0;

  const paidAt = raw.paid_at ? new Date(raw.paid_at) : null;
  const createdAt = raw.created_at ? new Date(raw.created_at) : null;

  const flags = {
    cancelled,
    gateway: raw.gateway ?? null,
    status: st,
    paymentStatus: ps,
  };
  if (cancelled) flags.panelExcluded = true;

  return {
    id,
    tnCreatedAt: createdAt,
    tnPaidAt: paidAt,
    tnStatus: st || null,
    tnPaymentStatus: ps || null,
    tnTotal: parseAmount(raw.total ?? raw.total_price ?? 0),
    tnSubtotal: parseAmount(raw.subtotal) || null,
    tnShipping: shipping || null,
    tnDiscount:
      parseAmount(raw.discount ?? raw.total_discount ?? raw.discount_amount) ||
      null,
    tnAnalyticsCounted: !cancelled && (ps === "paid" || ps === "authorized"),
    tnReportingFlags: flags,
    rawTnPayload: raw,
    items: mapTnLineItems(raw),
    /** helpers reconcile */
    paidAtIso: raw.paid_at ?? null,
    createdAtIso: raw.created_at ?? null,
  };
}

/**
 * KPI comercial TN — created_at ART + paid (universo API list por período)
 */
export function tnInPeriodKpiCreated(record, fromYmd, toYmd) {
  if (!record.tnAnalyticsCounted) return false;
  return inArtRange(record.createdAtIso ?? record.tnCreatedAt, fromYmd, toYmd);
}

/** KPI alternativo — paid_at ART */
export function tnInPeriodKpiPaidAt(record, fromYmd, toYmd) {
  if (!record.tnAnalyticsCounted) return false;
  return inArtRange(record.paidAtIso ?? record.tnPaidAt, fromYmd, toYmd);
}

/** Proxy panel — coalesce(paid_at, created_at) ART */
export function tnInPeriodKpiCoalesce(record, fromYmd, toYmd) {
  if (!record.tnAnalyticsCounted) return false;
  const iso =
    record.paidAtIso ??
    record.tnPaidAt ??
    record.createdAtIso ??
    record.tnCreatedAt;
  return inArtRange(iso, fromYmd, toYmd);
}

/** Default comercial L1 = created_at ART (replica TN API scope) */
export function tnInPeriodKpi(record, fromYmd, toYmd) {
  return tnInPeriodKpiCreated(record, fromYmd, toYmd);
}

function sumTnSubset(records, fromYmd, toYmd, filterFn) {
  const rows = records.filter((r) => filterFn(r, fromYmd, toYmd));
  return {
    orders: rows.length,
    facturacion: rows.reduce((s, r) => s + r.tnTotal, 0),
    ids: rows.map((r) => r.id),
  };
}

export function sumTnKpi(records, fromYmd, toYmd) {
  return {
    primary: sumTnSubset(records, fromYmd, toYmd, tnInPeriodKpiCreated),
    paidAtArt: sumTnSubset(records, fromYmd, toYmd, tnInPeriodKpiPaidAt),
    coalesceArt: sumTnSubset(records, fromYmd, toYmd, tnInPeriodKpiCoalesce),
  };
}
