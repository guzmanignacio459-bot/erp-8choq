/**
 * M6.5.1 — Financial Account Assignments + Periods service
 */

import type {
  FinancialAccountAssignment,
  FinancialAssignmentSource,
} from "@prisma/client";

import { isTnTransferOrder } from "@/lib/financial-accounts/is-tn-transfer-order";
import {
  getExistingAssignment,
  resolveFinancialAccountForDate,
} from "@/lib/financial-accounts/resolve-financial-account-assignment";
import { getPrisma } from "@/lib/db/prisma";
import type {
  V2FinancialAccountAssignmentRow,
  V2FinancialAccountPeriodCreateInput,
  V2FinancialAccountPeriodRow,
  V2TransferAssignmentKpi,
} from "@/types/erp-v2-financial-account-assignments";

function mapAssignmentRow(
  row: FinancialAccountAssignment & {
    account: { name: string; color: string };
  }
): V2FinancialAccountAssignmentRow {
  return {
    id: row.id,
    originType: row.originType,
    originId: row.originId,
    accountId: row.accountId,
    accountName: row.account.name,
    accountColor: row.account.color,
    assignmentSource: row.assignmentSource,
    assignedAt: row.assignedAt.toISOString(),
    ratePercentSnapshot: Number(row.ratePercentSnapshot),
    createdAt: row.createdAt.toISOString(),
  };
}

export async function fetchRecentAssignments(
  limit = 20
): Promise<V2FinancialAccountAssignmentRow[]> {
  const prisma = getPrisma();
  const rows = await prisma.financialAccountAssignment.findMany({
    where: { originType: "TN_ORDER" },
    orderBy: { assignedAt: "desc" },
    take: limit,
    include: { account: { select: { name: true, color: true } } },
  });
  return rows.map(mapAssignmentRow);
}

export async function fetchTransferAssignmentKpi(): Promise<V2TransferAssignmentKpi> {
  const prisma = getPrisma();
  const transferOrders = await prisma.tnOrder.findMany({
    where: { tnPaidAt: { not: null } },
    select: {
      id: true,
      paymentMethod: true,
      paymentGateway: true,
      rawTnPayload: true,
    },
  });

  const transferIds = transferOrders.filter(isTnTransferOrder).map((o) => o.id);
  const assignedRows =
    transferIds.length > 0
      ? await prisma.financialAccountAssignment.findMany({
          where: {
            originType: "TN_ORDER",
            originId: { in: transferIds },
          },
          select: { originId: true },
        })
      : [];

  const assignedSet = new Set(assignedRows.map((r) => r.originId));
  const active = await resolveFinancialAccountForDate(new Date());

  return {
    transferOrdersTotal: transferIds.length,
    transferAssigned: transferIds.filter((id) => assignedSet.has(id)).length,
    transferUnassigned: transferIds.filter((id) => !assignedSet.has(id)).length,
    activeAccountId: active?.account.id ?? null,
    activeAccountName: active?.account.name ?? null,
    activePeriodId: active?.period?.id ?? null,
  };
}

export type AssignTnTransferResult = {
  processed: number;
  assigned: number;
  skipped: number;
  unresolved: number;
  errors: string[];
};

export async function assignTnTransferOrder(
  tnOrderId: string,
  opts?: { dryRun?: boolean; force?: boolean }
): Promise<
  | { ok: true; action: "created" | "updated" | "skipped"; assignmentId?: string }
  | { ok: false; error: string; code: "not_transfer" | "unresolved" | "error" }
> {
  const prisma = getPrisma();
  const order = await prisma.tnOrder.findUnique({ where: { id: tnOrderId } });
  if (!order?.tnPaidAt) {
    return { ok: false, error: "order not paid", code: "error" };
  }
  if (!isTnTransferOrder(order)) {
    return { ok: false, error: "not a transfer order", code: "not_transfer" };
  }

  const existing = await getExistingAssignment("TN_ORDER", tnOrderId);
  if (existing && !opts?.force && existing.assignmentSource === "MANUAL") {
    return { ok: true, action: "skipped", assignmentId: existing.id };
  }

  const resolution = await resolveFinancialAccountForDate(order.tnPaidAt, {
    existing,
  });
  if (!resolution) {
    return { ok: false, error: "no account resolved", code: "unresolved" };
  }

  if (opts?.dryRun) {
    return { ok: true, action: existing ? "updated" : "created" };
  }

  const assignedAt = order.tnPaidAt;
  const rateSnapshot = Number(resolution.account.ratePercent);

  const row = await prisma.financialAccountAssignment.upsert({
    where: {
      originType_originId: { originType: "TN_ORDER", originId: tnOrderId },
    },
    create: {
      originType: "TN_ORDER",
      originId: tnOrderId,
      accountId: resolution.account.id,
      assignmentSource: resolution.source as FinancialAssignmentSource,
      assignedAt,
      ratePercentSnapshot: rateSnapshot,
    },
    update:
      opts?.force || existing?.assignmentSource !== "MANUAL"
        ? {
            accountId: resolution.account.id,
            assignmentSource: resolution.source as FinancialAssignmentSource,
            assignedAt,
            ratePercentSnapshot: rateSnapshot,
          }
        : {},
  });

  return {
    ok: true,
    action: existing ? "updated" : "created",
    assignmentId: row.id,
  };
}

export async function assignAllTnTransferOrders(opts?: {
  dryRun?: boolean;
  limit?: number;
}): Promise<AssignTnTransferResult> {
  const prisma = getPrisma();
  const dryRun = opts?.dryRun ?? true;
  const limit = opts?.limit ?? 5000;
  const errors: string[] = [];
  let processed = 0;
  let assigned = 0;
  let skipped = 0;
  let unresolved = 0;

  const orders = await prisma.tnOrder.findMany({
    where: { tnPaidAt: { not: null } },
    select: { id: true },
    orderBy: { tnPaidAt: "asc" },
    take: limit,
  });

  for (const { id } of orders) {
    const full = await prisma.tnOrder.findUnique({ where: { id } });
    if (!full || !isTnTransferOrder(full)) continue;

    processed++;
    const result = await assignTnTransferOrder(id, { dryRun });
    if (!result.ok) {
      if (result.code === "unresolved") unresolved++;
      else errors.push(`${id}: ${result.error}`);
      continue;
    }
    if (result.action === "skipped") skipped++;
    else assigned++;
  }

  return { processed, assigned, skipped, unresolved, errors };
}

export async function fetchV2FinancialAccountPeriods(): Promise<
  V2FinancialAccountPeriodRow[]
> {
  const prisma = getPrisma();
  const rows = await prisma.financialAccountPeriod.findMany({
    orderBy: { effectiveFrom: "desc" },
    include: { account: { select: { name: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    accountId: r.accountId,
    accountName: r.account.name,
    effectiveFrom: r.effectiveFrom.toISOString(),
    effectiveTo: r.effectiveTo?.toISOString() ?? null,
    isActive: r.isActive,
  }));
}

export async function createV2FinancialAccountPeriod(
  input: V2FinancialAccountPeriodCreateInput
): Promise<
  | { ok: true; data: V2FinancialAccountPeriodRow }
  | { ok: false; error: string }
> {
  const prisma = getPrisma();
  const account = await prisma.financialAccount.findUnique({
    where: { id: input.accountId },
  });
  if (!account) return { ok: false, error: "account not found" };

  const effectiveFrom = new Date(input.effectiveFrom);
  if (Number.isNaN(effectiveFrom.getTime())) {
    return { ok: false, error: "invalid effectiveFrom" };
  }
  const effectiveTo = input.effectiveTo ? new Date(input.effectiveTo) : null;
  if (effectiveTo && Number.isNaN(effectiveTo.getTime())) {
    return { ok: false, error: "invalid effectiveTo" };
  }

  const row = await prisma.financialAccountPeriod.create({
    data: {
      accountId: input.accountId,
      effectiveFrom,
      effectiveTo,
      isActive: input.isActive ?? true,
    },
    include: { account: { select: { name: true } } },
  });

  return {
    ok: true,
    data: {
      id: row.id,
      accountId: row.accountId,
      accountName: row.account.name,
      effectiveFrom: row.effectiveFrom.toISOString(),
      effectiveTo: row.effectiveTo?.toISOString() ?? null,
      isActive: row.isActive,
    },
  };
}

/** Staging bootstrap: cuenta default Santander si no hay cuentas. */
export async function ensureDefaultFinancialAccount(): Promise<string> {
  const prisma = getPrisma();
  const existing = await prisma.financialAccount.findFirst({
    where: { isActive: true, isDefault: true },
  });
  if (existing) return existing.id;

  const row = await prisma.financialAccount.create({
    data: {
      name: "Santander",
      ratePercent: 0.6,
      color: "#ef4444",
      isDefault: true,
      isActive: true,
    },
  });
  return row.id;
}

export async function seedDemoFinancialAccounts(): Promise<void> {
  const prisma = getPrisma();
  const count = await prisma.financialAccount.count();
  if (count > 0) return;

  await prisma.financialAccount.createMany({
    data: [
      {
        name: "Santander",
        ratePercent: 0.6,
        color: "#ef4444",
        isDefault: true,
        isActive: true,
      },
      {
        name: "Galicia",
        ratePercent: 5,
        color: "#f59e0b",
        isDefault: false,
        isActive: true,
      },
      {
        name: "Ignacio",
        ratePercent: 0,
        color: "#10b981",
        isDefault: false,
        isActive: true,
      },
      {
        name: "Proveedores",
        ratePercent: 0,
        color: "#6366f1",
        isDefault: false,
        isActive: true,
      },
      {
        name: "Carpintería",
        ratePercent: 0,
        color: "#8b5cf6",
        isDefault: false,
        isActive: true,
      },
    ],
  });
}
