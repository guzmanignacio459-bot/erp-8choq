/**
 * Mapea orden TN API → registro upsert Neon (capa A)
 */

import { deriveTnCommercialStatus } from "@/lib/erp/v2/tn-commercial-status";
import type { TnCommercialStatus } from "@/types/erp-v2-api";
import type { TnOrderRaw } from "@/lib/erp/v2/tn-api-client";

export type TnOrderItemRecord = {
  tnLineId: string;
  sku: string | null;
  productName: string | null;
  variantName: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  rawLine: unknown;
};

export type TnOrderUpsertRecord = {
  id: string;
  tnCreatedAt: Date | null;
  tnPaidAt: Date | null;
  tnUpdatedAt: Date | null;
  tnStatus: string | null;
  tnPaymentStatus: string | null;
  tnTotal: number;
  tnSubtotal: number | null;
  tnShipping: number | null;
  tnDiscount: number | null;
  tnAnalyticsCounted: boolean;
  tnReportingFlags: Record<string, unknown>;
  rawTnPayload: TnOrderRaw;
  commercialStatus: TnCommercialStatus;
  customerName: string | null;
  customerDni: string | null;
  customerPhone: string | null;
  provinceLocalidad: string | null;
  paymentGateway: string | null;
  paymentMethod: string | null;
  shippingOption: string | null;
  shippingOwner: string | null;
  items: TnOrderItemRecord[];
  updatedAtIso: string | null;
};

function parseAmount(value: unknown): number {
  if (value == null || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function str(value: unknown): string {
  return String(value ?? "").trim();
}

function mapTnLineItems(raw: TnOrderRaw): TnOrderItemRecord[] {
  const products = Array.isArray(raw.products) ? raw.products : [];
  return products.map((p, idx) => {
    const line = p as Record<string, unknown>;
    const variant = line.variant as Record<string, unknown> | undefined;
    const qty = Math.max(1, Math.round(parseAmount(line.quantity ?? 1)));
    const unit = parseAmount(line.price ?? line.unit_price ?? 0);
    return {
      tnLineId: String(line.id ?? line.product_id ?? idx),
      sku: str(line.sku ?? variant?.sku) || null,
      productName: str(line.name ?? line.product_name) || null,
      variantName: str(line.variant_name ?? variant?.name) || null,
      quantity: qty,
      unitPrice: unit,
      lineTotal: unit * qty,
      rawLine: line,
    };
  });
}

function extractCustomerName(raw: TnOrderRaw): string | null {
  const customer = (raw.customer ?? {}) as Record<string, unknown>;
  const billing = (raw.billing_address ?? {}) as Record<string, unknown>;
  const first = str(customer.firstname ?? customer.first_name);
  const last = str(customer.lastname ?? customer.last_name);
  const joined = [first, last].filter(Boolean).join(" ").trim();
  return joined || str(customer.name ?? billing.name) || null;
}

function extractCustomerDni(raw: TnOrderRaw): string | null {
  const customer = (raw.customer ?? {}) as Record<string, unknown>;
  const billing = (raw.billing_address ?? {}) as Record<string, unknown>;
  return (
    str(
      customer.identification ?? billing.dni ?? billing.identification
    ) || null
  );
}

function extractCustomerPhone(raw: TnOrderRaw): string | null {
  const customer = (raw.customer ?? {}) as Record<string, unknown>;
  const shipping = (raw.shipping_address ?? {}) as Record<string, unknown>;
  return str(customer.phone ?? raw.phone ?? shipping.phone) || null;
}

function extractProvinceLocalidad(raw: TnOrderRaw): string | null {
  const shipping = (raw.shipping_address ?? {}) as Record<string, unknown>;
  const province = str(shipping.province ?? shipping.state);
  const city = str(shipping.city ?? shipping.locality);
  if (province && city) return `${province} / ${city}`;
  return province || city || null;
}

function extractPaymentGateway(raw: TnOrderRaw): string | null {
  const payments = Array.isArray(raw.payments) ? raw.payments : [];
  const p0 = (payments[0] ?? {}) as Record<string, unknown>;
  return (
    str(
      raw.gateway ??
        raw.payment_gateway ??
        p0.gateway ??
        raw.payment_method_name
    ) || null
  );
}

function extractPaymentMethod(raw: TnOrderRaw): string | null {
  const details = (raw.payment_details ?? {}) as Record<string, unknown>;
  const payments = Array.isArray(raw.payments) ? raw.payments : [];
  const p0 = (payments[0] ?? {}) as Record<string, unknown>;
  return (
    str(
      details.payment_method_name ??
        details.payment_method ??
        raw.payment_method ??
        p0.payment_method
    ) || null
  );
}

function extractShippingOption(raw: TnOrderRaw): string | null {
  const option = raw.shipping_option;
  if (typeof option === "string") return str(option) || null;
  if (option && typeof option === "object") {
    const o = option as Record<string, unknown>;
    return str(o.name ?? o.title) || null;
  }
  const lines = Array.isArray(raw.shipping_lines) ? raw.shipping_lines : [];
  const l0 = (lines[0] ?? {}) as Record<string, unknown>;
  return (
    str(
      raw.shipping_method_name ??
        raw.shipping_carrier_name ??
        l0.name ??
        l0.title ??
        raw.shipping
    ) || null
  );
}

function extractShippingOwner(raw: TnOrderRaw): string | null {
  const customerCost = parseAmount(
    (raw.shipping_cost as Record<string, unknown> | undefined)?.customer ??
      raw.shipping_cost_customer
  );
  const ownerCost = parseAmount(
    (raw.shipping_cost as Record<string, unknown> | undefined)?.owner ??
      raw.shipping_cost_owner
  );
  if (customerCost > 0) return "CLIENTE";
  if (ownerCost > 0) return "8Q";
  return null;
}

/** Mapea orden TN API → registro capa A para upsert Neon */
export function mapTnOrderRecord(raw: TnOrderRaw): TnOrderUpsertRecord | null {
  const id = str(raw.id);
  if (!id) return null;

  const st = str(raw.status).toLowerCase();
  const ps = str(raw.payment_status).toLowerCase();
  const cancelled =
    st === "cancelled" ||
    st === "canceled" ||
    ps === "refunded" ||
    ps === "voided";

  const shipping =
    parseAmount(
      (raw.shipping_cost as Record<string, unknown> | undefined)?.customer
    ) ||
    parseAmount(raw.shipping_cost_customer) ||
    parseAmount(raw.shipping) ||
    0;

  const tnReportingFlags: Record<string, unknown> = {
    cancelled,
    gateway: raw.gateway ?? null,
    status: st,
    paymentStatus: ps,
  };
  if (cancelled) tnReportingFlags.panelExcluded = true;

  const commercialStatus = deriveTnCommercialStatus({
    tnStatus: st || null,
    tnPaymentStatus: ps || null,
    tnReportingFlags,
    rawTnPayload: raw,
  });

  return {
    id,
    tnCreatedAt: parseDate(raw.created_at),
    tnPaidAt: parseDate(raw.paid_at),
    tnUpdatedAt: parseDate(raw.updated_at),
    tnStatus: st || null,
    tnPaymentStatus: ps || null,
    tnTotal: parseAmount(raw.total ?? raw.total_price ?? 0),
    tnSubtotal: parseAmount(raw.subtotal) || null,
    tnShipping: shipping || null,
    tnDiscount:
      parseAmount(raw.discount ?? raw.total_discount ?? raw.discount_amount) ||
      null,
    tnAnalyticsCounted: !cancelled && (ps === "paid" || ps === "authorized"),
    tnReportingFlags,
    rawTnPayload: raw,
    commercialStatus,
    customerName: extractCustomerName(raw),
    customerDni: extractCustomerDni(raw),
    customerPhone: extractCustomerPhone(raw),
    provinceLocalidad: extractProvinceLocalidad(raw),
    paymentGateway: extractPaymentGateway(raw),
    paymentMethod: extractPaymentMethod(raw),
    shippingOption: extractShippingOption(raw),
    shippingOwner: extractShippingOwner(raw),
    items: mapTnLineItems(raw),
    updatedAtIso: raw.updated_at ? String(raw.updated_at) : null,
  };
}

export function maxTnUpdatedAt(
  records: TnOrderUpsertRecord[],
  fallback: Date
): Date {
  let max = fallback.getTime();
  for (const r of records) {
    const t = r.tnUpdatedAt?.getTime();
    if (t != null && t > max) max = t;
  }
  return new Date(max);
}
