/**
 * M6.2 / M6.5.3 — Net real financiero por unidad
 *
 * net_amount = gross - discount - tn_fee - mp_fee - shipping - transfer_fee
 */

export function roundMoney(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export type NetRealInputs = {
  grossAmount: number;
  discountAllocated: number;
  mpFeeAllocated: number;
  tnFeeAllocated: number;
  shippingAllocated: number;
  transferFeeAllocated?: number;
};

export function computeNetReal(params: NetRealInputs): number {
  const transferFeeAllocated = params.transferFeeAllocated ?? 0;
  return roundMoney(
    params.grossAmount -
      params.discountAllocated -
      params.mpFeeAllocated -
      params.tnFeeAllocated -
      params.shippingAllocated -
      transferFeeAllocated
  );
}
