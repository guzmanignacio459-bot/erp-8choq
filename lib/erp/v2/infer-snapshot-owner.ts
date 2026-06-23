import type { SnapshotOwner } from "@/lib/erp/v2/stock-maestro-constants";

/** Owner desde fila SKU STOCK MAESTRO — paridad GAS sufijo -SCNL */
export function inferSnapshotOwner(skuRaw: string): SnapshotOwner {
  const sku = String(skuRaw ?? "").trim().toUpperCase();
  return sku.endsWith("-SCNL") ? "SCNL" : "8Q";
}
