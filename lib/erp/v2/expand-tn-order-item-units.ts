/**
 * Expansión qty → unidades (1 prenda = 1 fila) — M4.1
 * No modifica tn_order_items.
 */

import { parseTnSku } from "@/lib/erp/v2/parse-tn-sku";

export type TnOrderItemLineInput = {
  id: string;
  tnOrderId: string;
  sku: string | null;
  productName?: string | null;
  quantity: number;
  unitPrice: number | string;
};

export type TnOrderItemUnitDraft = {
  tnOrderId: string;
  tnOrderItemId: string;
  unitIndex: number;
  sku: string | null;
  talle: string | null;
  owner: string | null;
  unitPrice: number;
  isGifty: boolean;
  isStockable: boolean;
  parseWarnings: string[] | null;
  source: string;
};

export type ExpandUnitsResult = {
  units: TnOrderItemUnitDraft[];
  expectedCount: number;
  warnings: Array<{ tnOrderItemId: string; code: string }>;
};

const UNIT_SOURCE = "m4_unit_expand";

function toUnitPrice(value: number | string): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Expande una línea TN con quantity=N en N unidades (unitIndex 0..N-1).
 * Precio unitario = tn_order_items.unit_price (no divide line_total).
 */
export function expandTnOrderItemToUnits(
  line: TnOrderItemLineInput
): ExpandUnitsResult {
  const qty = Math.max(0, Math.round(Number(line.quantity) || 0));
  const unitPrice = toUnitPrice(line.unitPrice);
  const warnings: ExpandUnitsResult["warnings"] = [];
  const units: TnOrderItemUnitDraft[] = [];

  if (qty <= 0) {
    warnings.push({ tnOrderItemId: line.id, code: "invalid_quantity" });
    return { units, expectedCount: 0, warnings };
  }

  const parsed = parseTnSku(line.sku);
  if (parsed.warnings.length) {
    for (const w of parsed.warnings) {
      warnings.push({ tnOrderItemId: line.id, code: w });
    }
  }

  for (let unitIndex = 0; unitIndex < qty; unitIndex++) {
    units.push({
      tnOrderId: line.tnOrderId,
      tnOrderItemId: line.id,
      unitIndex,
      sku: parsed.sku || line.sku,
      talle: parsed.talle,
      owner: parsed.owner || null,
      unitPrice,
      isGifty: parsed.isGifty,
      isStockable: parsed.isStockable,
      parseWarnings: parsed.warnings.length ? parsed.warnings : null,
      source: UNIT_SOURCE,
    });
  }

  return { units, expectedCount: qty, warnings };
}

export function expandTnOrderItemsBatch(
  lines: TnOrderItemLineInput[]
): ExpandUnitsResult {
  const allUnits: TnOrderItemUnitDraft[] = [];
  const allWarnings: ExpandUnitsResult["warnings"] = [];
  let expectedCount = 0;

  for (const line of lines) {
    const r = expandTnOrderItemToUnits(line);
    allUnits.push(...r.units);
    allWarnings.push(...r.warnings);
    expectedCount += r.expectedCount;
  }

  return {
    units: allUnits,
    expectedCount,
    warnings: allWarnings,
  };
}
