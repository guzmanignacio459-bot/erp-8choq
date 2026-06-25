/**
 * M6.2 — Net real financiero por unidad
 *
 * net_real = gross - discount - mp_fee - tn_fee - shipping
 */

export function roundMoney(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function computeNetReal(params: {
  grossAmount: number;
  discountAllocated: number;
  mpFeeAllocated: number;
  tnFeeAllocated: number;
  shippingAllocated: number;
}): number {
  return roundMoney(
    params.grossAmount -
      params.discountAllocated -
      params.mpFeeAllocated -
      params.tnFeeAllocated -
      params.shippingAllocated
  );
}
