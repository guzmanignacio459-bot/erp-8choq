/**
 * M6.5.2 — Transfer fee por orden + prorrateo por bruto (paridad centavos)
 */

import {
  allocateProportionalAmounts,
} from "@/lib/erp/v2/allocate-proportional-cents";
import { roundMoney } from "@/lib/financial-items/compute-net-real";

export function computeTransferFeeOrder(
  tnTotal: number,
  ratePercentSnapshot: number
): number {
  const rate = Number(ratePercentSnapshot) || 0;
  return roundMoney(Number(tnTotal) * (rate / 100));
}

export type TransferFeeUnitInput = {
  unitKey: string;
  grossAmount: number;
};

export type TransferFeeUnitAllocation = {
  unitKey: string;
  transferFeeAllocated: number;
};

/** Prorratea transfer_fee_order por gross unitario (patrón shipping/MP/commercial). */
export function allocateTransferFeeToUnits(
  transferFeeOrder: number,
  units: TransferFeeUnitInput[]
): TransferFeeUnitAllocation[] {
  if (!units.length) return [];

  const weights = units.map((u) => Math.max(0, Number(u.grossAmount) || 0));
  const parts = allocateProportionalAmounts(transferFeeOrder, weights);

  return units.map((u, i) => ({
    unitKey: u.unitKey,
    transferFeeAllocated: parts[i] ?? 0,
  }));
}
