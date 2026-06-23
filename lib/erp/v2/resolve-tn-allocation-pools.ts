/**
 * Pools de cabecera TN para prorrateo comercial — M4.2
 * Descuento: tn_discount (principal). Inferencia solo auditoría V-C6.
 */

export type TnAllocationPools = {
  poolDiscount: number;
  poolShippingOwner: number;
  poolFeeCommercial: number;
  shippingPaidCustomer: number;
  /** Solo auditoría V-C6 */
  poolDiscountInferred: number;
  sumUnitPrices: number;
};

export type TnOrderPoolInput = {
  tnSubtotal?: number | string | null;
  tnDiscount?: number | string | null;
  tnShipping?: number | string | null;
  tnTotal: number | string;
  shippingOwner?: string | null;
  rawTnPayload?: Record<string, unknown> | null;
};

function parseMoney(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const s = String(value).trim();
  if (!s) return 0;
  const clean = s.replace(/[^\d.,-]/g, "");
  if (clean.includes(",") && clean.includes(".")) {
    const n = Number(clean.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }
  if (clean.includes(",") && !clean.includes(".")) {
    const n = Number(clean.replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(clean);
  return Number.isFinite(n) ? n : 0;
}

function firstNonEmpty(...values: unknown[]): string {
  for (const v of values) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return "";
}

/** Envío cobrado al cliente (0 si gratis / absorbido por 8Q). */
export function getShippingPaidCustomer(
  raw: Record<string, unknown> | null | undefined,
  tnShipping?: number | string | null
): number {
  const payload = raw ?? {};
  const customer = parseMoney(payload.shipping_cost_customer);
  if (customer > 0) return customer;

  const owner = parseMoney(payload.shipping_cost_owner);
  if (owner > 0) return 0;

  const fallback = parseMoney(
    firstNonEmpty(
      payload.shipping_cost,
      payload.shipping_total,
      (payload.shipping_option as { cost?: unknown })?.cost,
      (payload.shipping_option as { price?: unknown })?.price,
      (payload.shipping_lines as { price?: unknown }[] | undefined)?.[0]?.price
    )
  );
  if (fallback > 0) return fallback;

  const tn = parseMoney(tnShipping);
  if (tn > 0 && tn < 1_000_000) return tn;
  return 0;
}

/** Costo envío absorbido por marca (solo si cliente no pagó). */
export function getShippingOwnerPool(
  raw: Record<string, unknown> | null | undefined,
  shippingPaidCustomer: number
): number {
  if (shippingPaidCustomer > 0) return 0;
  const payload = raw ?? {};
  return Math.max(0, parseMoney(payload.shipping_cost_owner));
}

export function resolveTnAllocationPools(
  order: TnOrderPoolInput,
  sumUnitPrices: number
): TnAllocationPools {
  const tnTotal = parseMoney(order.tnTotal);
  const poolDiscount = Math.max(0, parseMoney(order.tnDiscount));
  const shippingPaidCustomer = getShippingPaidCustomer(
    order.rawTnPayload as Record<string, unknown> | null,
    order.tnShipping
  );
  const poolShippingOwner = getShippingOwnerPool(
    order.rawTnPayload as Record<string, unknown> | null,
    shippingPaidCustomer
  );
  const poolFeeCommercial = 0;

  const poolDiscountInferred = Math.max(
    0,
    sumUnitPrices + shippingPaidCustomer - tnTotal
  );

  return {
    poolDiscount,
    poolShippingOwner,
    poolFeeCommercial,
    shippingPaidCustomer,
    poolDiscountInferred,
    sumUnitPrices,
  };
}
