/**
 * ERP V2 M6.4 / M6.5.2.2 — Financial Accounts service
 */

import type { FinancialAccount } from "@prisma/client";

import { mockAccountBalance } from "@/lib/financial-accounts/mock-balance";
import { getPrisma } from "@/lib/db/prisma";
import type {
  V2FinancialAccountCreateInput,
  V2FinancialAccountRow,
  V2FinancialAccountUpdateInput,
  V2FinancialAccountsCurrentDestination,
  V2FinancialAccountsKpi,
} from "@/types/erp-v2-financial-accounts";

function mapRow(row: FinancialAccount): V2FinancialAccountRow {
  const ratePercent = Number(row.ratePercent);
  return {
    id: row.id,
    name: row.name,
    displayName: row.displayName,
    ratePercent,
    color: row.color,
    isActive: Boolean(row.isActive),
    isDefault: Boolean(row.isDefault),
    balanceMock: mockAccountBalance(row.id, ratePercent),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function currentDestinationFromRows(
  rows: V2FinancialAccountRow[]
): V2FinancialAccountsCurrentDestination | null {
  const active = rows.find((r) => r.isActive);
  if (!active) return null;
  return {
    id: active.id,
    name: active.name,
    displayName: active.displayName,
    ratePercent: active.ratePercent,
  };
}

function computeKpi(rows: V2FinancialAccountRow[]): V2FinancialAccountsKpi {
  const active = rows.filter((r) => r.isActive);
  const current = currentDestinationFromRows(rows);
  const avgRate = current ? current.ratePercent : 0;

  return {
    totalCount: rows.length,
    activeCount: active.length,
    inactiveCount: rows.length - active.length,
    avgRatePercent: Math.round(avgRate * 100) / 100,
    zeroRateCount: rows.filter((r) => r.ratePercent === 0).length,
    currentDestination: current,
  };
}

async function countActiveAccounts(exceptId?: string): Promise<number> {
  const prisma = getPrisma();
  return prisma.financialAccount.count({
    where: {
      isActive: true,
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
  });
}

/** M6.5.2.2 — exactamente 1 activa + default al activar. */
export async function activateExclusiveFinancialAccount(
  id: string,
  patch?: Omit<V2FinancialAccountUpdateInput, "isActive" | "isDefault">
): Promise<
  | { ok: true; data: V2FinancialAccountRow }
  | { ok: false; error: string }
> {
  try {
    const prisma = getPrisma();
    const existing = await prisma.financialAccount.findUnique({ where: { id } });
    if (!existing) return { ok: false, error: "account not found" };

    if (patch?.ratePercent != null && (patch.ratePercent < 0 || patch.ratePercent > 100)) {
      return { ok: false, error: "ratePercent must be between 0 and 100" };
    }

    const row = await prisma.$transaction(async (tx) => {
      await tx.financialAccount.updateMany({
        data: { isActive: false, isDefault: false },
      });
      return tx.financialAccount.update({
        where: { id },
        data: {
          isActive: true,
          isDefault: true,
          ...(patch?.name != null ? { name: patch.name.trim() } : {}),
          ...(patch?.displayName !== undefined
            ? { displayName: patch.displayName?.trim() || null }
            : {}),
          ...(patch?.ratePercent != null ? { ratePercent: patch.ratePercent } : {}),
          ...(patch?.color != null ? { color: patch.color.trim() } : {}),
        },
      });
    });

    return { ok: true, data: mapRow(row) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
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
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
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
    const activeCount = await countActiveAccounts();
    const shouldActivate = activeCount === 0;

    const row = await prisma.financialAccount.create({
      data: {
        name,
        displayName: input.displayName?.trim() || null,
        ratePercent,
        color: input.color?.trim() || "#6366f1",
        isActive: shouldActivate,
        isDefault: shouldActivate,
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
  if (input.isActive === true) {
    const { isActive: _a, isDefault: _d, ...patch } = input;
    return activateExclusiveFinancialAccount(id, patch);
  }

  if (input.isActive === false) {
    return {
      ok: false,
      error:
        "cannot deactivate directly; activate another account to switch destination",
    };
  }

  try {
    const prisma = getPrisma();
    const existing = await prisma.financialAccount.findUnique({ where: { id } });
    if (!existing) return { ok: false, error: "account not found" };

    if (input.ratePercent != null && (input.ratePercent < 0 || input.ratePercent > 100)) {
      return { ok: false, error: "ratePercent must be between 0 and 100" };
    }

    if (input.isDefault === true && !existing.isActive) {
      return {
        ok: false,
        error: "only the active account can be marked as default",
      };
    }

    const row = await prisma.financialAccount.update({
      where: { id },
      data: {
        ...(input.name != null ? { name: input.name.trim() } : {}),
        ...(input.displayName !== undefined
          ? { displayName: input.displayName?.trim() || null }
          : {}),
        ...(input.ratePercent != null ? { ratePercent: input.ratePercent } : {}),
        ...(input.color != null ? { color: input.color.trim() } : {}),
        ...(input.isDefault != null && existing.isActive
          ? { isDefault: input.isDefault }
          : {}),
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
  return {
    ok: false,
    error:
      "cannot deactivate directly; activate another account to switch destination",
  };
}

/** M6.5.2.2 — Normaliza a exactamente 1 activa (prefiere isDefault, luego Santander, luego oldest). */
export async function enforceSingleActiveFinancialAccount(opts?: {
  dryRun?: boolean;
}): Promise<{
  beforeActive: number;
  afterActive: number;
  chosenId: string | null;
  dryRun: boolean;
}> {
  const prisma = getPrisma();
  const dryRun = opts?.dryRun ?? true;

  const actives = await prisma.financialAccount.findMany({
    where: { isActive: true },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });

  if (actives.length <= 1 && actives.length > 0) {
    return {
      beforeActive: actives.length,
      afterActive: actives.length,
      chosenId: actives[0]?.id ?? null,
      dryRun,
    };
  }

  let chosen =
    actives.find((a) => a.isDefault) ??
    actives.find((a) => a.name === "Santander") ??
    actives[0] ??
    null;

  if (!chosen) {
    const fallback = await prisma.financialAccount.findFirst({
      orderBy: { createdAt: "asc" },
    });
    if (!fallback) {
      return { beforeActive: 0, afterActive: 0, chosenId: null, dryRun };
    }
    if (!dryRun) {
      await activateExclusiveFinancialAccount(fallback.id);
    }
    return {
      beforeActive: 0,
      afterActive: 1,
      chosenId: fallback.id,
      dryRun,
    };
  }

  if (!dryRun) {
    await activateExclusiveFinancialAccount(chosen.id);
  }

  return {
    beforeActive: actives.length,
    afterActive: 1,
    chosenId: chosen.id,
    dryRun,
  };
}

export { mapRow as mapV2FinancialAccountRow, computeKpi as computeV2FinancialAccountsKpi };
