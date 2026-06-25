/**
 * M6.3.3 — Refresh financial_items for órdenes tocadas en pipeline (sin cambiar generator)
 */

import { generateFinancialItemsFromTn } from "@/services/financial-items/generate-from-tn";

export type LiveFinancialItemsSyncStats = {
  ordersRequested: number;
  ordersProcessed: number;
  itemsUpdated: number;
  itemsCreated: number;
  errors: number;
};

export type LiveFinancialItemsSyncResult = {
  dryRun: boolean;
  stats: LiveFinancialItemsSyncStats;
  errors: string[];
};

export async function runFinancialItemsSyncForOrders(
  tnOrderIds: string[],
  opts?: { dryRun?: boolean }
): Promise<LiveFinancialItemsSyncResult> {
  const dryRun = opts?.dryRun ?? true;
  const uniqueIds = [...new Set(tnOrderIds.map((id) => String(id).trim()).filter(Boolean))];

  const stats: LiveFinancialItemsSyncStats = {
    ordersRequested: uniqueIds.length,
    ordersProcessed: 0,
    itemsUpdated: 0,
    itemsCreated: 0,
    errors: 0,
  };
  const errors: string[] = [];

  if (!uniqueIds.length || dryRun) {
    return { dryRun, stats, errors };
  }

  for (const tnOrderId of uniqueIds) {
    try {
      const batch = await generateFinancialItemsFromTn({
        tnOrderId,
        dryRun: false,
      });
      stats.ordersProcessed++;
      stats.itemsUpdated += batch.updated;
      stats.itemsCreated += batch.created;
      stats.errors += batch.errors;
    } catch (err) {
      stats.errors++;
      errors.push(
        `${tnOrderId}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return { dryRun, stats, errors };
}
