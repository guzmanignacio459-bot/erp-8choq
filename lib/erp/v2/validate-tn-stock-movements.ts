/**
 * Validaciones stock ledger V-S1..V-S8 — M4.5b
 */

import type { StockMovementType } from "@prisma/client";

export type StockValidationCheckId =
  | "V-S1"
  | "V-S2"
  | "V-S3"
  | "V-S4"
  | "V-S5"
  | "V-S6"
  | "V-S7"
  | "V-S8";

export type StockValidationFailure = {
  check: StockValidationCheckId;
  message: string;
  expected?: number;
  actual?: number;
};

export type StockSaleMovementDraft = {
  tnOrderItemUnitId: string;
  sku: string;
  talle: string | null;
  quantity: number;
  movementType: StockMovementType;
  idempotencyKey: string;
};

export type StockOrderValidationResult = {
  passed: boolean;
  failures: StockValidationFailure[];
  expectedSales: number;
  actualSales: number;
};

export type StockBatchValidationResult = {
  passed: boolean;
  failures: StockValidationFailure[];
  ordersValidated: number;
  ordersFailed: number;
  expectedSales: number;
  actualSales: number;
};

const GIFTY_SKUS = new Set(["GIFTY"]);

export function validateOrderStockSales(
  movements: StockSaleMovementDraft[],
  expectedStockableUnits: number
): StockOrderValidationResult {
  const failures: StockValidationFailure[] = [];
  const saleMoves = movements.filter((m) => m.movementType === "sale");
  const unitIds = saleMoves.map((m) => m.tnOrderItemUnitId);

  const uniqueUnits = new Set(unitIds);
  if (uniqueUnits.size !== saleMoves.length) {
    failures.push({
      check: "V-S3",
      message: "sale duplicado por tn_order_item_unit_id",
      expected: uniqueUnits.size,
      actual: saleMoves.length,
    });
  }

  const idemKeys = saleMoves.map((m) => m.idempotencyKey);
  if (idemKeys.length !== new Set(idemKeys).size) {
    failures.push({
      check: "V-S6",
      message: "idempotency_key duplicada en batch",
    });
  }

  for (const m of saleMoves) {
    if (m.quantity !== 1) {
      failures.push({
        check: "V-S2",
        message: `quantity ≠ 1 en unit ${m.tnOrderItemUnitId}`,
        expected: 1,
        actual: m.quantity,
      });
      break;
    }

    const sku = String(m.sku ?? "").trim().toUpperCase();
    if (GIFTY_SKUS.has(sku) || sku.startsWith("GIFTY-")) {
      failures.push({
        check: "V-S4",
        message: `GIFTY en movement unit ${m.tnOrderItemUnitId}`,
      });
      break;
    }

    if (!m.tnOrderItemUnitId) {
      failures.push({
        check: "V-S5",
        message: "tn_order_item_unit_id vacío",
      });
      break;
    }
  }

  if (saleMoves.length !== expectedStockableUnits) {
    failures.push({
      check: "V-S1",
      message: "1 sale por unit stockable esperada",
      expected: expectedStockableUnits,
      actual: saleMoves.length,
    });
  }

  return {
    passed: failures.length === 0,
    failures,
    expectedSales: expectedStockableUnits,
    actualSales: saleMoves.length,
  };
}

export function validatePilotCoverage(
  expectedSales: number,
  actualSales: number
): StockValidationFailure | null {
  if (expectedSales !== actualSales) {
    return {
      check: "V-S7",
      message: "sale movements ≠ units stockables esperadas (pilot)",
      expected: expectedSales,
      actual: actualSales,
    };
  }
  return null;
}
