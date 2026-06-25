/**
 * M6.3.3 — Payment sync live (post-commercial, pre-MP allocation)
 */

import { getPrisma } from "@/lib/db/prisma";
import {
  syncTnPaymentFromMp,
  type SyncTnPaymentResult,
} from "@/services/erp-v2-payments-sync";

export const M6_PAYMENTS_SYNC_LIVE_SOURCE = "m6.3.3_payment_sync_live";
const DEFAULT_MAX_ORDERS = 100;
const SYNC_THROTTLE_MS = 120;

export type LivePaymentSyncStats = {
  ordersPending: number;
  ordersProcessed: number;
  paymentsCreated: number;
  paymentsUpdated: number;
  paymentsSkipped: number;
  ordersFailed: number;
  syncedOrderIds: string[];
};

export type LivePaymentSyncResult = {
  dryRun: boolean;
  stats: LivePaymentSyncStats;
  orderResults: SyncTnPaymentResult[];
  errors: string[];
};

export async function listPendingMpPaymentSyncOrderIds(
  limit = DEFAULT_MAX_ORDERS
): Promise<string[]> {
  const prisma = getPrisma();
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT o.id
    FROM tn_orders o
    WHERE o.tn_paid_at IS NOT NULL
      AND LOWER(COALESCE(o.payment_gateway, '')) = 'mercado-pago'
      AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.tn_order_id = o.id)
    ORDER BY o.tn_paid_at ASC
    LIMIT ${limit}
  `;
  return rows.map((r) => String(r.id));
}

export async function runPostT0PaymentSyncLive(opts?: {
  dryRun?: boolean;
  maxOrders?: number;
}): Promise<LivePaymentSyncResult> {
  const dryRun = opts?.dryRun ?? true;
  const maxOrders = opts?.maxOrders ?? DEFAULT_MAX_ORDERS;
  const errors: string[] = [];
  const orderResults: SyncTnPaymentResult[] = [];
  const syncedOrderIds: string[] = [];

  const pendingIds = await listPendingMpPaymentSyncOrderIds(maxOrders);
  const stats: LivePaymentSyncStats = {
    ordersPending: pendingIds.length,
    ordersProcessed: 0,
    paymentsCreated: 0,
    paymentsUpdated: 0,
    paymentsSkipped: 0,
    ordersFailed: 0,
    syncedOrderIds: [],
  };

  if (dryRun) {
    return { dryRun, stats, orderResults, errors };
  }

  for (const tnOrderId of pendingIds) {
    stats.ordersProcessed++;
    try {
      const result = await syncTnPaymentFromMp({ tnOrderId });
      orderResults.push(result);

      if (result.ok) {
        if (result.action === "created") stats.paymentsCreated++;
        else if (result.action === "updated") stats.paymentsUpdated++;
        else stats.paymentsSkipped++;
        syncedOrderIds.push(tnOrderId);
      } else {
        stats.ordersFailed++;
      }
    } catch (err) {
      stats.ordersFailed++;
      errors.push(
        `${tnOrderId}: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    await new Promise((r) => setTimeout(r, SYNC_THROTTLE_MS));
  }

  stats.syncedOrderIds = syncedOrderIds;
  return { dryRun, stats, orderResults, errors };
}
