/**
 * Motor comercial TN-only — M4.2a (sin MP, sin stock)
 */

import {
  allocateProportionalAmounts,
} from "@/lib/erp/v2/allocate-proportional-cents";
import {
  resolveTnAllocationPools,
  type TnAllocationPools,
  type TnOrderPoolInput,
} from "@/lib/erp/v2/resolve-tn-allocation-pools";

export type TnOrderUnitInput = {
  id: string;
  tnOrderId: string;
  tnOrderItemId: string;
  unitPrice: number | string;
  owner?: string | null;
};

export type CommercialUnitAllocation = {
  tnOrderId: string;
  tnOrderItemId: string;
  tnOrderItemUnitId: string;
  grossUnitAmount: number;
  discountAllocated: number;
  shippingAllocated: number;
  feeAllocated: number;
  netoPrenda: number;
  owner: string | null;
};

export type CommercialAllocationResult = {
  allocations: CommercialUnitAllocation[];
  pools: TnAllocationPools;
};

function roundMoney(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function toNum(v: number | string): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function allocateTnOrderCommercial(
  order: TnOrderPoolInput,
  units: TnOrderUnitInput[]
): CommercialAllocationResult {
  if (!units.length) {
    throw new Error("allocateTnOrderCommercial: sin unidades");
  }

  const weights = units.map((u) => toNum(u.unitPrice));
  const sumUnitPrices = weights.reduce((a, b) => a + b, 0);
  const pools = resolveTnAllocationPools(order, sumUnitPrices);

  const discountParts = allocateProportionalAmounts(
    pools.poolDiscount,
    weights
  );
  const shippingParts = allocateProportionalAmounts(
    pools.poolShippingOwner,
    weights
  );
  const feeParts = allocateProportionalAmounts(
    pools.poolFeeCommercial,
    weights
  );

  const allocations: CommercialUnitAllocation[] = units.map((u, i) => {
    const unitPrice = weights[i]!;
    const discountAllocated = discountParts[i]!;
    const shippingAllocated = shippingParts[i]!;
    const feeAllocated = feeParts[i]!;
    const netoPrenda = roundMoney(
      unitPrice - discountAllocated + feeAllocated
    );

    return {
      tnOrderId: u.tnOrderId,
      tnOrderItemId: u.tnOrderItemId,
      tnOrderItemUnitId: u.id,
      grossUnitAmount: unitPrice,
      discountAllocated,
      shippingAllocated,
      feeAllocated,
      netoPrenda,
      owner: u.owner ?? null,
    };
  });

  return { allocations, pools };
}
