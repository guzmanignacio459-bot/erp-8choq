/**
 * M6.5.1 — Resolver cuenta financiera para origen TN/REMITO
 *
 * Prioridad: MANUAL (existente) → PERIOD → DEFAULT → null
 */

import type {
  FinancialAccount,
  FinancialAccountAssignment,
  FinancialAccountPeriod,
} from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import type { FinancialAssignmentSource } from "@/types/erp-v2-financial-account-assignments";

export type AssignmentResolution = {
  account: FinancialAccount;
  source: FinancialAssignmentSource;
  period: FinancialAccountPeriod | null;
};

export async function findActivePeriodAt(
  at: Date
): Promise<(FinancialAccountPeriod & { account: FinancialAccount }) | null> {
  const prisma = getPrisma();
  return prisma.financialAccountPeriod.findFirst({
    where: {
      isActive: true,
      effectiveFrom: { lte: at },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: at } }],
      account: { isActive: true },
    },
    orderBy: { effectiveFrom: "desc" },
    include: { account: true },
  });
}

export async function findDefaultAccount(): Promise<FinancialAccount | null> {
  const prisma = getPrisma();
  return prisma.financialAccount.findFirst({
    where: { isActive: true, isDefault: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function getExistingAssignment(
  originType: "TN_ORDER" | "REMITO",
  originId: string
): Promise<FinancialAccountAssignment | null> {
  const prisma = getPrisma();
  return prisma.financialAccountAssignment.findUnique({
    where: {
      originType_originId: { originType, originId },
    },
  });
}

export async function resolveFinancialAccountForDate(
  at: Date,
  opts?: { skipManual?: boolean; existing?: FinancialAccountAssignment | null }
): Promise<AssignmentResolution | null> {
  const existing = opts?.existing ?? null;
  if (existing?.assignmentSource === "MANUAL") {
    const prisma = getPrisma();
    const account = await prisma.financialAccount.findUnique({
      where: { id: existing.accountId },
    });
    if (account?.isActive) {
      return { account, source: "MANUAL", period: null };
    }
    return null;
  }

  const periodRow = await findActivePeriodAt(at);
  if (periodRow) {
    return {
      account: periodRow.account,
      source: "PERIOD",
      period: periodRow,
    };
  }

  const defaultAccount = await findDefaultAccount();
  if (defaultAccount) {
    return { account: defaultAccount, source: "DEFAULT", period: null };
  }

  return null;
}

export async function getActiveAccountSnapshot(at = new Date()): Promise<{
  accountId: string | null;
  accountName: string | null;
  periodId: string | null;
  source: FinancialAssignmentSource | null;
}> {
  const resolution = await resolveFinancialAccountForDate(at);
  if (!resolution) {
    return {
      accountId: null,
      accountName: null,
      periodId: null,
      source: null,
    };
  }
  return {
    accountId: resolution.account.id,
    accountName: resolution.account.name,
    periodId: resolution.period?.id ?? null,
    source: resolution.source,
  };
}
