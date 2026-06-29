/**
 * M6.5.2.4 — Transfer assignments live (post-commercial, pre-payments)
 *
 * Idempotente: si ya existe assignment → skip (sin update).
 * Snapshot histórico: assignedAt = tnPaidAt, ratePercentSnapshot al resolver.
 */

import type { FinancialAssignmentSource } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import {
  isTnTransferOrder,
  TN_TRANSFER_SQL_FILTER,
} from "@/lib/financial-accounts/is-tn-transfer-order";
import {
  getExistingAssignment,
  resolveFinancialAccountForDate,
} from "@/lib/financial-accounts/resolve-financial-account-assignment";

export const M6_TRANSFER_ASSIGNMENTS_LIVE_SOURCE =
  "m6.5.2.4_transfer_assignments_live";

const DEFAULT_MAX_ORDERS = 500;

export type LiveTransferAssignmentSkipReason =
  | "already_assigned"
  | "not_transfer"
  | "unpaid";

export type LiveTransferAssignmentItemResult =
  | {
      ok: true;
      tnOrderId: string;
      action: "created" | "skipped";
      skipReason?: LiveTransferAssignmentSkipReason;
      assignmentId?: string;
      accountId?: string;
      accountName?: string;
      ratePercentSnapshot?: number;
      assignmentSource?: string;
    }
  | {
      ok: false;
      tnOrderId: string;
      error: string;
      code: "unresolved" | "error";
    };

export type LiveTransferAssignmentStats = {
  ordersPending: number;
  ordersProcessed: number;
  assignmentsCreated: number;
  assignmentsWouldCreate: number;
  assignmentsSkipped: number;
  ordersFailed: number;
  ordersUnresolved: number;
};

export type LiveTransferAssignmentResult = {
  dryRun: boolean;
  stats: LiveTransferAssignmentStats;
  orderResults: LiveTransferAssignmentItemResult[];
  errors: string[];
};

/** Transferencias pagadas sin financial_account_assignment. */
export async function listPendingTransferAssignmentOrderIds(
  limit = DEFAULT_MAX_ORDERS
): Promise<string[]> {
  const prisma = getPrisma();
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT o.id FROM tn_orders o WHERE ${TN_TRANSFER_SQL_FILTER}
     AND NOT EXISTS (
       SELECT 1 FROM financial_account_assignments a
       WHERE a.origin_type = 'TN_ORDER' AND a.origin_id = o.id
     )
     ORDER BY o.tn_paid_at ASC
     LIMIT ${limit}`
  );
  return rows.map((r) => String(r.id));
}

export async function assignTransferOrderLive(
  tnOrderId: string,
  opts?: { dryRun?: boolean }
): Promise<LiveTransferAssignmentItemResult> {
  const dryRun = opts?.dryRun ?? true;
  const prisma = getPrisma();
  const order = await prisma.tnOrder.findUnique({ where: { id: tnOrderId } });

  if (!order?.tnPaidAt) {
    return {
      ok: true,
      tnOrderId,
      action: "skipped",
      skipReason: "unpaid",
    };
  }

  if (!isTnTransferOrder(order)) {
    return {
      ok: true,
      tnOrderId,
      action: "skipped",
      skipReason: "not_transfer",
    };
  }

  const existing = await getExistingAssignment("TN_ORDER", tnOrderId);
  if (existing) {
    return {
      ok: true,
      tnOrderId,
      action: "skipped",
      skipReason: "already_assigned",
      assignmentId: existing.id,
    };
  }

  const resolution = await resolveFinancialAccountForDate(order.tnPaidAt);
  if (!resolution) {
    return {
      ok: false,
      tnOrderId,
      error: "no account resolved",
      code: "unresolved",
    };
  }

  const ratePercentSnapshot = Number(resolution.account.ratePercent);

  if (dryRun) {
    return {
      ok: true,
      tnOrderId,
      action: "created",
      accountId: resolution.account.id,
      accountName: resolution.account.name,
      ratePercentSnapshot,
      assignmentSource: resolution.source,
    };
  }

  const row = await prisma.financialAccountAssignment.create({
    data: {
      originType: "TN_ORDER",
      originId: tnOrderId,
      accountId: resolution.account.id,
      assignmentSource: resolution.source as FinancialAssignmentSource,
      assignedAt: order.tnPaidAt,
      ratePercentSnapshot,
    },
  });

  return {
    ok: true,
    tnOrderId,
    action: "created",
    assignmentId: row.id,
    accountId: resolution.account.id,
    accountName: resolution.account.name,
    ratePercentSnapshot,
    assignmentSource: resolution.source,
  };
}

export async function runPostT0TransferAssignmentsLive(opts?: {
  dryRun?: boolean;
  maxOrders?: number;
}): Promise<LiveTransferAssignmentResult> {
  const dryRun = opts?.dryRun ?? true;
  const maxOrders = opts?.maxOrders ?? DEFAULT_MAX_ORDERS;
  const errors: string[] = [];
  const orderResults: LiveTransferAssignmentItemResult[] = [];

  const pendingIds = await listPendingTransferAssignmentOrderIds(maxOrders);
  const stats: LiveTransferAssignmentStats = {
    ordersPending: pendingIds.length,
    ordersProcessed: 0,
    assignmentsCreated: 0,
    assignmentsWouldCreate: 0,
    assignmentsSkipped: 0,
    ordersFailed: 0,
    ordersUnresolved: 0,
  };

  for (const tnOrderId of pendingIds) {
    stats.ordersProcessed++;
    const result = await assignTransferOrderLive(tnOrderId, { dryRun });
    orderResults.push(result);

    if (!result.ok) {
      if (result.code === "unresolved") stats.ordersUnresolved++;
      else stats.ordersFailed++;
      errors.push(`${tnOrderId}: ${result.error}`);
      continue;
    }

    if (result.action === "created") {
      if (dryRun) stats.assignmentsWouldCreate++;
      else stats.assignmentsCreated++;
    } else stats.assignmentsSkipped++;
  }

  return { dryRun, stats, orderResults, errors };
}
