/**
 * M6.5.2.1 — Órdenes elegibles para Financial Items refresh tras commercial
 */

import type { LiveCommercialAllocateItemResult } from "@/services/erp-v2-allocations-commercial-live";

/** Órdenes con allocations nuevas o ya existentes (transfer / non-MP). */
export function collectFiOrderIdsFromCommercialResults(
  orderResults: LiveCommercialAllocateItemResult[]
): string[] {
  const ids: string[] = [];
  for (const item of orderResults) {
    if (!item.ok) continue;
    if (!item.skipped) {
      ids.push(item.tnOrderId);
      continue;
    }
    if (item.skipReason === "already_allocated") {
      ids.push(item.tnOrderId);
    }
  }
  return ids;
}
