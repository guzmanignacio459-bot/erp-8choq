/**
 * Validaciones comerciales V-C1..V-C6 — M4.2a
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
    fee: number;
    netoPrenda: number;
    unitPrice: number;
  };
  audit: {
    poolDiscountInferred: number;
    shippingPaidCustomer: number;
    closureDelta: number;
  };
};

function sumField(
  allocations: CommercialUnitAllocation[],
  field: keyof Pick<
    CommercialUnitAllocation,
    "discountAllocated" | "shippingAllocated" | "feeAllocated" | "netoPrenda"
  >
): number {
  return allocations.reduce((a, row) => a + Number(row[field] || 0), 0);
}

function near(a: number, b: number, tol = TOLERANCE): boolean {
  return Math.abs(a - b) <= tol;
}

export function validateTnCommercialAllocations(
  allocations: CommercialUnitAllocation[],
  pools: TnAllocationPools,
  tnSubtotal: number,
  tnTotal: number
): CommercialValidationResult {
  const failures: ValidationFailure[] = [];

  const sumDiscount = sumField(allocations, "discountAllocated");
  const sumShipping = sumField(allocations, "shippingAllocated");
  const sumFee = sumField(allocations, "feeAllocated");
  const sumNeto = sumField(allocations, "netoPrenda");
  const sumUnitPrice = pools.sumUnitPrices;

  if (!near(sumDiscount, pools.poolDiscount)) {
    failures.push({
      check: "V-C1",
      message: "Σ discount_allocated ≠ pool_discount",
      expected: pools.poolDiscount,
      actual: sumDiscount,
      delta: sumDiscount - pools.poolDiscount,
    });
  }

  if (!near(sumShipping, pools.poolShippingOwner)) {
    failures.push({
      check: "V-C2",
      message: "Σ shipping_allocated ≠ pool_shipping_owner",
      expected: pools.poolShippingOwner,
      actual: sumShipping,
      delta: sumShipping - pools.poolShippingOwner,
    });
  }

  if (!near(sumFee, pools.poolFeeCommercial)) {
    failures.push({
      check: "V-C3",
      message: "Σ fee_allocated ≠ pool_fee_commercial",
      expected: pools.poolFeeCommercial,
      actual: sumFee,
      delta: sumFee - pools.poolFeeCommercial,
    });
  }

  const expectedNeto = sumUnitPrice - sumDiscount + sumFee;
  if (!near(sumNeto, expectedNeto)) {
    failures.push({
      check: "V-C4",
      message: "Σ neto_prenda ≠ Σ unit_price - Σ discount + Σ fee",
      expected: expectedNeto,
      actual: sumNeto,
      delta: sumNeto - expectedNeto,
    });
  }

  if (!near(sumUnitPrice, tnSubtotal)) {
    failures.push({
      check: "V-C5",
      message: "Σ unit_price ≠ tn_subtotal",
      expected: tnSubtotal,
      actual: sumUnitPrice,
      delta: sumUnitPrice - tnSubtotal,
    });
  }

  const closure =
    sumNeto + pools.shippingPaidCustomer;
  const closureDelta = closure - tnTotal;
  if (!near(closure, tnTotal)) {
    failures.push({
      check: "V-C6",
      message: "Cierre comercial: Σ neto_prenda + shipping_paid ≠ tn_total",
      expected: tnTotal,
      actual: closure,
      delta: closureDelta,
    });
  }

  return {
    passed: failures.length === 0,
    failures,
    sums: {
      discount: sumDiscount,
      shipping: sumShipping,
      fee: sumFee,
      netoPrenda: sumNeto,
      unitPrice: sumUnitPrice,
    },
    audit: {
      poolDiscountInferred: pools.poolDiscountInferred,
      shippingPaidCustomer: pools.shippingPaidCustomer,
      closureDelta,
    },
  };
}
