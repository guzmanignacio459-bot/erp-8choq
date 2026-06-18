/**
 * Pools MP por orden TN — fuente payments (M4.2c)
 * ADR: mp_neto_real_orden = transaction_details.net_received_amount
 */

export type MpAllocationPools = {
  mpNetoRealOrden: number;
  mpTaxTotal: number;
  mpFinancingTotal: number;
  mpFeeTotal: number;
  mpPlatformFeeTotal: number;
  mpTotalCost: number;
};

export type MpPaymentPoolInput = {
  mpNetoRealOrden?: number | string | null;
  mpTaxTotalReal?: number | string | null;
  mpFinancingTotalReal?: number | string | null;
  mpFeeTotalReal?: number | string | null;
  mpPlatformFeeTotalReal?: number | string | null;
  mpTotalCostReal?: number | string | null;
};

function toNum(v: unknown): number {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function resolveMpAllocationPools(
  payment: MpPaymentPoolInput
): MpAllocationPools {
  const mpTaxTotal = toNum(payment.mpTaxTotalReal);
  const mpFinancingTotal = toNum(payment.mpFinancingTotalReal);
  const mpFeeTotal = toNum(payment.mpFeeTotalReal);
  const mpPlatformFeeTotal = toNum(payment.mpPlatformFeeTotalReal);
  const mpNetoRealOrden = toNum(payment.mpNetoRealOrden);

  const mpTotalCost =
    toNum(payment.mpTotalCostReal) > 0
      ? toNum(payment.mpTotalCostReal)
      : mpTaxTotal + mpFinancingTotal + mpFeeTotal + mpPlatformFeeTotal;

  return {
    mpNetoRealOrden,
    mpTaxTotal,
    mpFinancingTotal,
    mpFeeTotal,
    mpPlatformFeeTotal,
    mpTotalCost,
  };
}
