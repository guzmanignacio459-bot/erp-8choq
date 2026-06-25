/**
 * M6.5.2 — Aplica transfer_fee_allocated a financial_items (sin tocar net_real)
 */

import {
  allocateTransferFeeToUnits,
  computeTransferFeeOrder,
} from "@/lib/financial-items/transfer-fee-allocation";
import { getPrisma } from "@/lib/db/prisma";

export type ApplyTransferFeeResult = {
  tnOrderId: string;
  ok: boolean;
  itemsUpdated: number;
  transferFeeOrder: number;
  ratePercentSnapshot: number;
  skipped?: string;
};

export async function applyTransferFeeForTnOrder(
  tnOrderId: string,
  opts?: { dryRun?: boolean }
): Promise<ApplyTransferFeeResult> {
  const prisma = getPrisma();
  const dryRun = opts?.dryRun ?? false;

  const assignment = await prisma.financialAccountAssignment.findUnique({
    where: {
      originType_originId: { originType: "TN_ORDER", originId: tnOrderId },
    },
  });

  if (!assignment) {
    return {
      tnOrderId,
      ok: false,
      itemsUpdated: 0,
      transferFeeOrder: 0,
      ratePercentSnapshot: 0,
      skipped: "no_assignment",
    };
  }

  const order = await prisma.tnOrder.findUnique({
    where: { id: tnOrderId },
    select: { tnTotal: true },
  });

  if (!order) {
    return {
      tnOrderId,
      ok: false,
      itemsUpdated: 0,
      transferFeeOrder: 0,
      ratePercentSnapshot: Number(assignment.ratePercentSnapshot),
      skipped: "order_not_found",
    };
  }

  const items = await prisma.financialItem.findMany({
    where: { originType: "TN_ORDER", originId: tnOrderId },
    select: { id: true, unitKey: true, grossAmount: true },
    orderBy: { unitKey: "asc" },
  });

  if (!items.length) {
    return {
      tnOrderId,
      ok: false,
      itemsUpdated: 0,
      transferFeeOrder: 0,
      ratePercentSnapshot: Number(assignment.ratePercentSnapshot),
      skipped: "no_financial_items",
    };
  }

  const ratePercentSnapshot = Number(assignment.ratePercentSnapshot);
  const transferFeeOrder = computeTransferFeeOrder(
    Number(order.tnTotal),
    ratePercentSnapshot
  );

  const allocations = allocateTransferFeeToUnits(
    transferFeeOrder,
    items.map((fi) => ({
      unitKey: fi.unitKey,
      grossAmount: Number(fi.grossAmount),
    }))
  );

  const byUnitKey = new Map(
    allocations.map((a) => [a.unitKey, a.transferFeeAllocated])
  );

  if (!dryRun) {
    for (const fi of items) {
      const transferFeeAllocated = byUnitKey.get(fi.unitKey) ?? 0;
      await prisma.financialItem.update({
        where: { id: fi.id },
        data: { transferFeeAllocated },
      });
    }
  }

  return {
    tnOrderId,
    ok: true,
    itemsUpdated: items.length,
    transferFeeOrder,
    ratePercentSnapshot,
  };
}

export type ApplyTransferFeeBatchResult = {
  ordersProcessed: number;
  ordersOk: number;
  ordersSkipped: number;
  itemsUpdated: number;
  transferFeeTotal: number;
  errors: string[];
};

export async function applyTransferFeeForAllAssignedOrders(opts?: {
  dryRun?: boolean;
}): Promise<ApplyTransferFeeBatchResult> {
  const prisma = getPrisma();
  const dryRun = opts?.dryRun ?? true;

  const assignments = await prisma.financialAccountAssignment.findMany({
    where: { originType: "TN_ORDER" },
    select: { originId: true },
    orderBy: { assignedAt: "asc" },
  });

  let ordersProcessed = 0;
  let ordersOk = 0;
  let ordersSkipped = 0;
  let itemsUpdated = 0;
  let transferFeeTotal = 0;
  const errors: string[] = [];

  for (const { originId } of assignments) {
    ordersProcessed++;
    try {
      const result = await applyTransferFeeForTnOrder(originId, { dryRun });
      if (!result.ok) {
        ordersSkipped++;
        if (result.skipped === "no_financial_items") {
          errors.push(`${originId}: no financial items`);
        }
        continue;
      }
      ordersOk++;
      itemsUpdated += result.itemsUpdated;
      transferFeeTotal += result.transferFeeOrder;
    } catch (err) {
      ordersSkipped++;
      errors.push(
        `${originId}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return {
    ordersProcessed,
    ordersOk,
    ordersSkipped,
    itemsUpdated,
    transferFeeTotal,
    errors,
  };
}

export type TransferFeeSyncResult = {
  ordersProcessed: number;
  ordersOk: number;
  ordersSkipped: number;
  errors: string[];
};

/** M6.5.2.1 — Transfer fee para órdenes tocadas en pipeline (post FI refresh). */
export async function runTransferFeeSyncForOrders(
  tnOrderIds: string[],
  opts?: { dryRun?: boolean }
): Promise<TransferFeeSyncResult> {
  const dryRun = opts?.dryRun ?? true;
  const uniqueIds = [...new Set(tnOrderIds.map((id) => String(id).trim()).filter(Boolean))];

  let ordersProcessed = 0;
  let ordersOk = 0;
  let ordersSkipped = 0;
  const errors: string[] = [];

  if (!uniqueIds.length || dryRun) {
    return { ordersProcessed, ordersOk, ordersSkipped, errors };
  }

  for (const tnOrderId of uniqueIds) {
    ordersProcessed++;
    try {
      const result = await applyTransferFeeForTnOrder(tnOrderId, { dryRun: false });
      if (!result.ok) {
        ordersSkipped++;
        continue;
      }
      ordersOk++;
    } catch (err) {
      ordersSkipped++;
      errors.push(
        `${tnOrderId}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return { ordersProcessed, ordersOk, ordersSkipped, errors };
}
