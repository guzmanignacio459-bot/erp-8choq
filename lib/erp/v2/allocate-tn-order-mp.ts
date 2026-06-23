/**
 * Prorrateo MP por unidad TN — M4.2c TN-first
 *
 * Pools MP desde payments; peso = gross_unit_amount.
 * Cierre centavos: allocateProportionalCents (V-M1..V-M4 exactos).
 *
 * neto_prenda_real se prorratea desde mp_neto_real_orden (ADR M3),
 * no como neto_prenda − cost (GAS recalcula header; TN-first usa API net).
 */

import {
  allocateProportionalCents,
  fromCents,
} from "@/lib/erp/v2/allocate-proportional-cents";
import {
  resolveMpAllocationPools,
  type MpAllocationPools,
  type MpPaymentPoolInput,
} from "@/lib/erp/v2/resolve-mp-allocation-pools";

export type MpCommercialUnitInput = {
  tnOrderItemUnitId: string;
  grossUnitAmount: number;
  netoPrenda: number;
  owner?: string | null;
};

export type MpUnitAllocation = {
  tnOrderItemUnitId: string;
  mpTaxAllocatedReal: number;
  mpFinancingAllocatedReal: number;
  mpFeeAllocatedReal: number;
  mpPlatformFeeAllocatedReal: number;
  mpTotalCostAllocatedReal: number;
  netoPrendaReal: number;
  netoPrendaScnl: number | null;
  netoPrenda8q: number | null;
};

export type MpAllocationResult = {
  allocations: MpUnitAllocation[];
  pools: MpAllocationPools;
};

function roundMoney(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function effectiveWeights(weights: number[]): number[] {
  const ws = weights.map((w) => Math.max(0, Number(w) || 0));
  const allZero = ws.every((w) => w === 0);
  return allZero ? ws.map(() => 1) : ws;
}

export function allocateTnOrderMp(
  payment: MpPaymentPoolInput,
  units: MpCommercialUnitInput[]
): MpAllocationResult {
  if (!units.length) {
    throw new Error("allocateTnOrderMp: sin unidades comerciales");
  }

  const pools = resolveMpAllocationPools(payment);
  const effWeights = effectiveWeights(
    units.map((u) => Number(u.grossUnitAmount) || 0)
  );

  const taxC = allocateProportionalCents(pools.mpTaxTotal, effWeights);
  const finC = allocateProportionalCents(pools.mpFinancingTotal, effWeights);
  const feeC = allocateProportionalCents(pools.mpFeeTotal, effWeights);
  const platC = allocateProportionalCents(pools.mpPlatformFeeTotal, effWeights);
  const netoC = allocateProportionalCents(pools.mpNetoRealOrden, effWeights);

  const allocations: MpUnitAllocation[] = units.map((u, i) => {
    const tax = fromCents(taxC[i]!);
    const fin = fromCents(finC[i]!);
    const fee = fromCents(feeC[i]!);
    const plat = fromCents(platC[i]!);
    const total = roundMoney(tax + fin + fee + plat);
    const netoPrendaReal = fromCents(netoC[i]!);
    const owner = String(u.owner ?? "").toUpperCase().trim();
    const isScnl = owner === "SCNL";

    return {
      tnOrderItemUnitId: u.tnOrderItemUnitId,
      mpTaxAllocatedReal: tax,
      mpFinancingAllocatedReal: fin,
      mpFeeAllocatedReal: fee,
      mpPlatformFeeAllocatedReal: plat,
      mpTotalCostAllocatedReal: total,
      netoPrendaReal,
      netoPrendaScnl: isScnl ? netoPrendaReal : null,
      netoPrenda8q: isScnl ? null : netoPrendaReal,
    };
  });

  return { allocations, pools };
}
