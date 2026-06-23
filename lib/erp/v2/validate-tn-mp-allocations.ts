/**
 * Validaciones MP V-M1..V-M4 — M4.2c
 */

import type { MpUnitAllocation } from "@/lib/erp/v2/allocate-tn-order-mp";
import type { MpAllocationPools } from "@/lib/erp/v2/resolve-mp-allocation-pools";

const TOLERANCE = 0.01;

export type MpValidationCheckId = "V-M1" | "V-M2" | "V-M3" | "V-M4";

export type MpValidationFailure = {
  check: MpValidationCheckId;
  message: string;
  expected?: number;
  actual?: number;
  delta?: number;
};

export type MpValidationResult = {
  passed: boolean;
  failures: MpValidationFailure[];
  sums: {
    mpFeeAllocated: number;
    mpTaxAllocated: number;
    mpFinancingAllocated: number;
    mpPlatformFeeAllocated: number;
    mpTotalCostAllocated: number;
    netoPrendaReal: number;
  };
};

function near(a: number, b: number, tol = TOLERANCE): boolean {
  return Math.abs(a - b) <= tol;
}

export function validateTnMpAllocations(
  allocations: MpUnitAllocation[],
  pools: MpAllocationPools
): MpValidationResult {
  const failures: MpValidationFailure[] = [];

  const sumFee = allocations.reduce(
    (a, r) => a + Number(r.mpFeeAllocatedReal || 0),
    0
  );
  const sumTax = allocations.reduce(
    (a, r) => a + Number(r.mpTaxAllocatedReal || 0),
    0
  );
  const sumFin = allocations.reduce(
    (a, r) => a + Number(r.mpFinancingAllocatedReal || 0),
    0
  );
  const sumPlat = allocations.reduce(
    (a, r) => a + Number(r.mpPlatformFeeAllocatedReal || 0),
    0
  );
  const sumTotal = allocations.reduce(
    (a, r) => a + Number(r.mpTotalCostAllocatedReal || 0),
    0
  );
  const sumNeto = allocations.reduce(
    (a, r) => a + Number(r.netoPrendaReal || 0),
    0
  );

  if (!near(sumFee, pools.mpFeeTotal)) {
    failures.push({
      check: "V-M1",
      message: "Σ fee_allocated ≠ mp_fee_total",
      expected: pools.mpFeeTotal,
      actual: sumFee,
      delta: sumFee - pools.mpFeeTotal,
    });
  }

  if (!near(sumTax, pools.mpTaxTotal)) {
    failures.push({
      check: "V-M2",
      message: "Σ tax_allocated ≠ mp_tax_total",
      expected: pools.mpTaxTotal,
      actual: sumTax,
      delta: sumTax - pools.mpTaxTotal,
    });
  }

  if (!near(sumFin, pools.mpFinancingTotal)) {
    failures.push({
      check: "V-M3",
      message: "Σ financing_allocated ≠ mp_financing_cost",
      expected: pools.mpFinancingTotal,
      actual: sumFin,
      delta: sumFin - pools.mpFinancingTotal,
    });
  }

  if (!near(sumNeto, pools.mpNetoRealOrden)) {
    failures.push({
      check: "V-M4",
      message: "Σ neto_prenda_real ≠ mp_neto_real_orden",
      expected: pools.mpNetoRealOrden,
      actual: sumNeto,
      delta: sumNeto - pools.mpNetoRealOrden,
    });
  }

  return {
    passed: failures.length === 0,
    failures,
    sums: {
      mpFeeAllocated: sumFee,
      mpTaxAllocated: sumTax,
      mpFinancingAllocated: sumFin,
      mpPlatformFeeAllocated: sumPlat,
      mpTotalCostAllocated: sumTotal,
      netoPrendaReal: sumNeto,
    },
  };
}
