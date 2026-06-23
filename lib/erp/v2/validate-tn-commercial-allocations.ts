/**
 * Validaciones comerciales V-C1..V-C6 — M4.2b
 */

import type { CommercialUnitAllocation } from "@/lib/erp/v2/allocate-tn-order-commercial";
import type { TnAllocationPools } from "@/lib/erp/v2/resolve-tn-allocation-pools";

const TOLERANCE = 0.01;

export type ValidationCheckId = "V-C1" | "V-C2" | "V-C3" | "V-C4" | "V-C5" | "V-C6";

export type ValidationFailure = {
  check: ValidationCheckId;
  message: string;
  expected?: number;
  actual?: number;
  delta?: number;
};

export type CommercialValidationResult = {
  passed: boolean;
  failures: ValidationFailure[];
  sums: {
    discount: number;
    shipping: number;
    grossUnitAmount: number;
    netCommercialAmount: number;
  };
  audit: {
    tnDiscount: number;
    poolDiscountInferred: number;
    discountInferenceDelta: number;
  };
};

function near(a: number, b: number, tol = TOLERANCE): boolean {
  return Math.abs(a - b) <= tol;
}

export function validateTnCommercialAllocations(
  allocations: CommercialUnitAllocation[],
  pools: TnAllocationPools,
  tnSubtotal: number,
  tnDiscount: number,
  unitCount: number
): CommercialValidationResult {
  const failures: ValidationFailure[] = [];

  const sumDiscount = allocations.reduce(
    (a, row) => a + Number(row.discountAllocated || 0),
    0
  );
  const sumShipping = allocations.reduce(
    (a, row) => a + Number(row.shippingAllocated || 0),
    0
  );
  const sumGross = allocations.reduce(
    (a, row) => a + Number(row.grossUnitAmount || 0),
    0
  );
  const sumNet = allocations.reduce(
    (a, row) => a + Number(row.netoPrenda || 0),
    0
  );

  if (!near(sumDiscount, pools.poolDiscount)) {
    failures.push({
      check: "V-C1",
      message: "Σ discount_allocated ≠ tn_discount",
      expected: pools.poolDiscount,
      actual: sumDiscount,
      delta: sumDiscount - pools.poolDiscount,
    });
  }

  if (!near(sumShipping, pools.poolShippingOwner)) {
    failures.push({
      check: "V-C2",
      message: "Σ shipping_allocated ≠ shipping pool",
      expected: pools.poolShippingOwner,
      actual: sumShipping,
      delta: sumShipping - pools.poolShippingOwner,
    });
  }

  if (!near(sumGross, tnSubtotal)) {
    failures.push({
      check: "V-C3",
      message: "Σ gross_unit_amount ≠ subtotal esperado",
      expected: tnSubtotal,
      actual: sumGross,
      delta: sumGross - tnSubtotal,
    });
  }

  for (const row of allocations) {
    const negatives = [
      ["gross_unit_amount", row.grossUnitAmount],
      ["discount_allocated", row.discountAllocated],
      ["shipping_allocated", row.shippingAllocated],
      ["fee_allocated", row.feeAllocated],
      ["net_commercial_amount", row.netoPrenda],
    ].filter(([, v]) => Number(v) < -TOLERANCE);

    if (negatives.length) {
      failures.push({
        check: "V-C4",
        message: `allocations negativas en unit ${row.tnOrderItemUnitId}: ${negatives.map(([k]) => k).join(", ")}`,
      });
      break;
    }
  }

  if (allocations.length !== unitCount) {
    failures.push({
      check: "V-C5",
      message: "1 allocation por unidad",
      expected: unitCount,
      actual: allocations.length,
      delta: allocations.length - unitCount,
    });
  }

  const discountInferenceDelta = pools.poolDiscountInferred - tnDiscount;

  return {
    passed: failures.length === 0,
    failures,
    sums: {
      discount: sumDiscount,
      shipping: sumShipping,
      grossUnitAmount: sumGross,
      netCommercialAmount: sumNet,
    },
    audit: {
      tnDiscount,
      poolDiscountInferred: pools.poolDiscountInferred,
      discountInferenceDelta,
    },
  };
}

export type BatchCoverageResult = {
  tnOnlyOrders: number;
  tnOnlyUnits: number;
  allocatedOrders: number;
  allocatedUnits: number;
  orderCoveragePct: number;
  unitCoveragePct: number;
  duplicateUnitAllocations: number;
  orphanAllocations: number;
};

export type BatchValidationSummary = {
  ordersProcessed: number;
  ordersFailed: number;
  unitsProcessed: number;
  validationFailures: Array<{
    check: ValidationCheckId;
    count: number;
    orders: string[];
  }>;
  coverage: BatchCoverageResult;
  auditV6: {
    ordersWithInferenceDelta: number;
    maxInferenceDelta: number;
    orders: Array<{
      tnOrderId: string;
      tnDiscount: number;
      poolDiscountInferred: number;
      delta: number;
    }>;
  };
};
