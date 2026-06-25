/**
 * ERP V2 M6.4 — Financial Accounts service
 */

import type { FinancialAccount } from "@prisma/client";

import { mockAccountBalance } from "@/lib/financial-accounts/mock-balance";
import { getPrisma } from "@/lib/db/prisma";
import type {
  V2FinancialAccountCreateInput,
  V2FinancialAccountRow,
  V2FinancialAccountUpdateInput,
  V2FinancialAccountsKpi,
} from "@/types/erp-v2-financial-accounts";

function mapRow(row: FinancialAccount): V2FinancialAccountRow {
  const ratePercent = Number(row.ratePercent);
  return {
    id: row.id,
    name: row.name,
    ratePercent,
    color: row.color,
    isActive: row.isActive,
    isDefault: row.isDefault,
    balanceMock: mockAccountBalance(row.id, ratePercent),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function computeKpi(rows: V2FinancialAccountRow[]): V2FinancialAccountsKpi {
  const active = rows.filter((r) => r.isActive);
  const avgRate =
    active.length > 0
      ? active.reduce((s, r) => s + r.ratePercent, 0) / active.length
      : 0;

  return {
    totalCount: rows.length,
    activeCount: active.length,
    inactiveCount: rows.length - active.length,
    avgRatePercent: Math.round(avgRate * 100) / 100,
    zeroRateCount: active.filter((r) => r.ratePercent === 0).length,
  };
}

async function clearOtherDefaults(exceptId?: string): Promise<void> {
  const prisma = getPrisma();
  await prisma.financialAccount.updateMany({
    where: exceptId ? { id: { not: exceptId }, isDefault: true } : { isDefault: true },
    data: { isDefault: false },
  });
}

export async function fetchV2FinancialAccounts(opts?: {
  activeOnly?: boolean;
}): Promise<
  | { ok: true; data: V2FinancialAccountRow[]; count: number; kpi: V2FinancialAccountsKpi }
  | { ok: false; error: string }
> {
  try {
    const prisma = getPrisma();
    const rows = await prisma.financialAccount.findMany({
      where: opts?.activeOnly ? { isActive: true } : undefined,
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });
    const data = rows.map(mapRow);
    return { ok: true, data, count: data.length, kpi: computeKpi(data) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function createV2FinancialAccount(
  input: V2FinancialAccountCreateInput
): Promise<
  | { ok: true; data: V2FinancialAccountRow }
  | { ok: false; error: string }
> {
  const name = input.name?.trim();
  if (!name) return { ok: false, error: "name is required" };

  const ratePercent = input.ratePercent ?? 0;
  if (ratePercent < 0 || ratePercent > 100) {
    return { ok: false, error: "ratePercent must be between 0 and 100" };
  }

  try {
    const prisma = getPrisma();
    const isDefault = input.isDefault ?? false;

    if (isDefault) {
      await clearOtherDefaults();
    }

    const row = await prisma.financialAccount.create({
      data: {
        name,
        ratePercent,
        color: input.color?.trim() || "#6366f1",
        isDefault,
      },
    });

    return { ok: true, data: mapRow(row) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function updateV2FinancialAccount(
  id: string,
  input: V2FinancialAccountUpdateInput
): Promise<
  | { ok: true; data: V2FinancialAccountRow }
  | { ok: false; error: string }
> {
  try {
    const prisma = getPrisma();
    const existing = await prisma.financialAccount.findUnique({ where: { id } });
    if (!existing) return { ok: false, error: "account not found" };

    if (input.ratePercent != null && (input.ratePercent < 0 || input.ratePercent > 100)) {
      return { ok: false, error: "ratePercent must be between 0 and 100" };
    }

    if (input.isDefault === true) {
      await clearOtherDefaults(id);
    }

    const row = await prisma.financialAccount.update({
      where: { id },
      data: {
        ...(input.name != null ? { name: input.name.trim() } : {}),
        ...(input.ratePercent != null ? { ratePercent: input.ratePercent } : {}),
        ...(input.color != null ? { color: input.color.trim() } : {}),
        ...(input.isActive != null ? { isActive: input.isActive } : {}),
        ...(input.isDefault != null ? { isDefault: input.isDefault } : {}),
      },
    });

    return { ok: true, data: mapRow(row) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function deactivateV2FinancialAccount(
  id: string
): Promise<
  | { ok: true; data: V2FinancialAccountRow }
  | { ok: false; error: string }
> {
  return updateV2FinancialAccount(id, { isActive: false, isDefault: false });
}
