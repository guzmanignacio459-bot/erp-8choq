/**
 * M6.2 — Montos financieros por unidad TN desde allocation M5
 */

import type { Prisma } from "@prisma/client";

import { computeNetReal, roundMoney } from "@/lib/financial-items/compute-net-real";

export type UnitFinancialAmounts = {
  grossAmount: number;
  discountAllocated: number;
  tnFeeAllocated: number;
  mpFeeAllocated: number;
  shippingAllocated: number;
  netAmount: number;
};

type AllocationRow = {
  grossUnitAmount: Prisma.Decimal;
  discountAllocated: Prisma.Decimal;
  shippingAllocated: Prisma.Decimal;
  feeAllocated: Prisma.Decimal;
  mpTotalCostAllocatedReal: Prisma.Decimal | null;
  mpFeeAllocatedReal: Prisma.Decimal | null;
  mpTaxAllocatedReal: Prisma.Decimal | null;
  mpFinancingAllocatedReal: Prisma.Decimal | null;
  mpPlatformFeeAllocatedReal: Prisma.Decimal | null;
};

function toNum(value: Prisma.Decimal | null | undefined): number {
  if (value == null) return 0;
  return Number(value);
}

export function pickMpFeeAllocated(alloc: {
  mpTotalCostAllocatedReal: Prisma.Decimal | null;
  mpFeeAllocatedReal: Prisma.Decimal | null;
  mpTaxAllocatedReal: Prisma.Decimal | null;
  mpFinancingAllocatedReal: Prisma.Decimal | null;
  mpPlatformFeeAllocatedReal: Prisma.Decimal | null;
}): number {
  if (alloc.mpTotalCostAllocatedReal != null) {
    return Number(alloc.mpTotalCostAllocatedReal);
  }
  return roundMoney(
    toNum(alloc.mpFeeAllocatedReal) +
      toNum(alloc.mpTaxAllocatedReal) +
      toNum(alloc.mpFinancingAllocatedReal) +
      toNum(alloc.mpPlatformFeeAllocatedReal)
  );
}

export function amountsFromAllocation(alloc: AllocationRow): UnitFinancialAmounts {
  const grossAmount = toNum(alloc.grossUnitAmount);
  const discountAllocated = toNum(alloc.discountAllocated);
  const tnFeeAllocated = toNum(alloc.feeAllocated);
  const mpFeeAllocated = pickMpFeeAllocated(alloc);
  const shippingAllocated = toNum(alloc.shippingAllocated);

  return {
    grossAmount,
    discountAllocated,
    tnFeeAllocated,
    mpFeeAllocated,
    shippingAllocated,
    netAmount: computeNetReal({
      grossAmount,
      discountAllocated,
      mpFeeAllocated,
      tnFeeAllocated,
      shippingAllocated,
    }),
  };
}
