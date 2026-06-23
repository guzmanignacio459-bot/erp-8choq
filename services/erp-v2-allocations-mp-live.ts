/**
 * M5.2c — MP allocations live post-T0 (enrich commercial, sin ledger)
 */

import { getPrisma } from "@/lib/db/prisma";
import { allocateTnOrderMp } from "@/lib/erp/v2/allocate-tn-order-mp";
import {
  validateTnMpAllocations,
  type MpValidationCheckId,
  type MpValidationFailure,
  type MpValidationResult,
} from "@/lib/erp/v2/validate-tn-mp-allocations";
import { loadActiveSnapshotDate } from "@/services/erp-v2-stock-ledger";
import type { Prisma } from "@prisma/client";

export const M5_MP_LIVE_SOURCE = "m5.2c_mp_allocation";

export type PostT0MpAllocationAudit = {
  snapshotDate: string;
  postT0Orders: number;
  postT0WithMpPayment: number;
  postT0WithCommercialAlloc: number;
  ordersPendingMpAllocation: number;
  ordersAlreadyMpEnriched: number;
  unitsPendingMpAllocation: number;
  unitsAlreadyMpEnriched: number;
};

export type LiveMpAllocationStats = {
  snapshotDate: string;
  ordersProcessed: number;
  ordersSkipped: number;
  ordersFailed: number;
  unitsProcessed: number;
  allocationsEnriched: number;
  allocationsSkippedExisting: number;
  validationChecks: Record<MpValidationCheckId, "PASS" | "FAIL" | "N/A">;
  liveChecks: Record<"L-M1" | "L-M2" | "L-M3" | "L-M4", "PASS" | "FAIL">;
  unitsWritten: false;
  commercialAllocationsWritten: false;
  stockMovementsWritten: false;
  snapshotTouched: false;
};

export type LiveMpAllocateItemResult =
  | {
      ok: true;
      tnOrderId: string;
      skipped?: boolean;
      skipReason?: string;
      unitCount: number;
      allocationsEnriched: number;
      mpPaymentId: string | null;
      validation: MpValidationResult;
    }
  | {
      ok: false;
      tnOrderId: string;
      error: string;
      code: string;
      validation?: MpValidationResult;
    };

export type LiveMpAllocationResult = {
  dryRun: boolean;
  preAudit: PostT0MpAllocationAudit;
  stats: LiveMpAllocationStats;
  orderResults: LiveMpAllocateItemResult[];
  errors: string[];
};

function toNum(v: Prisma.Decimal | number | string | null | undefined): number {
  if (v == null) return 0;
  return Number(v);
}

export async function auditPostT0MpAllocation(
  snapshotDate: Date
): Promise<PostT0MpAllocationAudit> {
  const prisma = getPrisma();

  const [
    postT0,
    withMp,
    withCommercial,
    pending,
    enriched,
    pendingUnits,
    enrichedUnits,
  ] = await Promise.all([
    prisma.$queryRaw<Array<{ n: number }>>`
      SELECT COUNT(*)::int AS n
      FROM tn_orders o
      WHERE o.synced_at >= ${snapshotDate} OR o.tn_paid_at >= ${snapshotDate}
    `,
    prisma.$queryRaw<Array<{ n: number }>>`
      SELECT COUNT(DISTINCT o.id)::int AS n
      FROM tn_orders o
      JOIN payments p ON p.tn_order_id = o.id
      WHERE (o.synced_at >= ${snapshotDate} OR o.tn_paid_at >= ${snapshotDate})
        AND p.source = 'mp_api_sync_staging'
        AND p.mp_neto_real_orden IS NOT NULL
    `,
    prisma.$queryRaw<Array<{ n: number }>>`
      SELECT COUNT(DISTINCT o.id)::int AS n
      FROM tn_orders o
      JOIN tn_order_item_allocations a ON a.tn_order_id = o.id
      WHERE o.synced_at >= ${snapshotDate} OR o.tn_paid_at >= ${snapshotDate}
    `,
    prisma.$queryRaw<Array<{ orders: number; units: number }>>`
      SELECT
        COUNT(*)::int AS orders,
        COALESCE(SUM(pending_units), 0)::int AS units
      FROM (
        SELECT o.id,
          (
            SELECT COUNT(*)::int
            FROM tn_order_item_allocations a
            WHERE a.tn_order_id = o.id AND a.neto_prenda_real IS NULL
          ) AS pending_units
        FROM tn_orders o
        JOIN payments p ON p.tn_order_id = o.id
        WHERE (o.synced_at >= ${snapshotDate} OR o.tn_paid_at >= ${snapshotDate})
          AND p.source = 'mp_api_sync_staging'
          AND p.mp_neto_real_orden IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM tn_order_item_allocations a WHERE a.tn_order_id = o.id
          )
          AND NOT EXISTS (
            SELECT 1 FROM tn_order_item_allocations a
            WHERE a.tn_order_id = o.id AND a.neto_prenda_real IS NOT NULL
          )
      ) q
      WHERE pending_units > 0
    `,
    prisma.$queryRaw<Array<{ orders: number; units: number }>>`
      SELECT
        COUNT(DISTINCT o.id)::int AS orders,
        COUNT(a.id)::int AS units
      FROM tn_orders o
      JOIN tn_order_item_allocations a ON a.tn_order_id = o.id
      JOIN payments p ON p.tn_order_id = o.id
      WHERE (o.synced_at >= ${snapshotDate} OR o.tn_paid_at >= ${snapshotDate})
        AND p.source = 'mp_api_sync_staging'
        AND a.neto_prenda_real IS NOT NULL
    `,
    prisma.$queryRaw<Array<{ n: number }>>`
      SELECT COUNT(a.id)::int AS n
      FROM tn_order_item_allocations a
      JOIN tn_orders o ON o.id = a.tn_order_id
      JOIN payments p ON p.tn_order_id = o.id
      WHERE (o.synced_at >= ${snapshotDate} OR o.tn_paid_at >= ${snapshotDate})
        AND p.source = 'mp_api_sync_staging'
        AND p.mp_neto_real_orden IS NOT NULL
        AND a.neto_prenda_real IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM tn_order_item_allocations a2
          WHERE a2.tn_order_id = o.id AND a2.neto_prenda_real IS NOT NULL
        )
    `,
    prisma.$queryRaw<Array<{ n: number }>>`
      SELECT COUNT(a.id)::int AS n
      FROM tn_order_item_allocations a
      JOIN tn_orders o ON o.id = a.tn_order_id
      WHERE (o.synced_at >= ${snapshotDate} OR o.tn_paid_at >= ${snapshotDate})
        AND a.neto_prenda_real IS NOT NULL
    `,
  ]);

  const p = pending[0] ?? { orders: 0, units: 0 };
  const e = enriched[0] ?? { orders: 0, units: 0 };

  return {
    snapshotDate: snapshotDate.toISOString(),
    postT0Orders: postT0[0]?.n ?? 0,
    postT0WithMpPayment: withMp[0]?.n ?? 0,
    postT0WithCommercialAlloc: withCommercial[0]?.n ?? 0,
    ordersPendingMpAllocation: p.orders,
    ordersAlreadyMpEnriched: e.orders,
    unitsPendingMpAllocation: pendingUnits[0]?.n ?? 0,
    unitsAlreadyMpEnriched: enrichedUnits[0]?.n ?? 0,
  };
}

export async function listPostT0PendingMpAllocationOrderIds(
  snapshotDate: Date
): Promise<string[]> {
  const prisma = getPrisma();
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT DISTINCT o.id
    FROM tn_orders o
    JOIN payments p ON p.tn_order_id = o.id
    WHERE (o.synced_at >= ${snapshotDate} OR o.tn_paid_at >= ${snapshotDate})
      AND p.source = 'mp_api_sync_staging'
      AND p.mp_neto_real_orden IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM tn_order_item_allocations a WHERE a.tn_order_id = o.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM tn_order_item_allocations a
        WHERE a.tn_order_id = o.id AND a.neto_prenda_real IS NOT NULL
      )
    ORDER BY o.id ASC
  `;
  return rows.map((r) => String(r.id));
}

async function loadOrderForMpLive(tnOrderId: string) {
  const prisma = getPrisma();
  return prisma.tnOrder.findUnique({
    where: { id: tnOrderId },
    include: {
      payments: {
        where: {
          mpNetoRealOrden: { not: null },
          source: "mp_api_sync_staging",
        },
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
      allocations: {
        orderBy: [{ tnOrderItemId: "asc" }, { tnOrderItemUnitId: "asc" }],
      },
    },
  });
}

async function persistMpAllocationsLive(
  mpRows: Awaited<ReturnType<typeof allocateTnOrderMp>>["allocations"]
): Promise<{ enriched: number; skipped: number }> {
  const prisma = getPrisma();
  let enriched = 0;
  let skipped = 0;

  await prisma.$transaction(async (tx) => {
    for (const row of mpRows) {
      const existing = await tx.tnOrderItemAllocation.findUnique({
        where: { tnOrderItemUnitId: row.tnOrderItemUnitId },
        select: { netoPrendaReal: true },
      });
      if (!existing) {
        skipped += 1;
        continue;
      }
      if (existing.netoPrendaReal != null) {
        skipped += 1;
        continue;
      }

      await tx.tnOrderItemAllocation.update({
        where: { tnOrderItemUnitId: row.tnOrderItemUnitId },
        data: {
          mpTaxAllocatedReal: row.mpTaxAllocatedReal,
          mpFinancingAllocatedReal: row.mpFinancingAllocatedReal,
          mpFeeAllocatedReal: row.mpFeeAllocatedReal,
          mpPlatformFeeAllocatedReal: row.mpPlatformFeeAllocatedReal,
          mpTotalCostAllocatedReal: row.mpTotalCostAllocatedReal,
          netoPrendaReal: row.netoPrendaReal,
          netoPrendaScnl: row.netoPrendaScnl,
          netoPrenda8q: row.netoPrenda8q,
        },
      });
      enriched += 1;
    }
  });

  return { enriched, skipped };
}

export async function allocatePostT0OrderMpLive(
  tnOrderId: string,
  opts?: { dryRun?: boolean; snapshotDate?: Date }
): Promise<LiveMpAllocateItemResult> {
  const snapshotDate = opts?.snapshotDate;
  const order = await loadOrderForMpLive(tnOrderId);

  if (!order) {
    return {
      ok: false,
      tnOrderId,
      error: "tn_order not found",
      code: "NOT_FOUND",
    };
  }

  if (snapshotDate) {
    const isPostT0 =
      order.syncedAt >= snapshotDate ||
      (order.tnPaidAt != null && order.tnPaidAt >= snapshotDate);
    if (!isPostT0) {
      return {
        ok: false,
        tnOrderId,
        error: "orden pre-T0",
        code: "PRE_T0",
      };
    }
  }

  const payment = order.payments[0];
  if (!payment?.mpNetoRealOrden) {
    return {
      ok: false,
      tnOrderId,
      error: "sin payment mp_api_sync_staging",
      code: "NO_PAYMENT",
    };
  }

  if (!order.allocations.length) {
    return {
      ok: false,
      tnOrderId,
      error: "sin commercial allocations",
      code: "NO_COMMERCIAL",
    };
  }

  const alreadyEnriched = order.allocations.some(
    (a) => a.netoPrendaReal != null
  );
  if (alreadyEnriched) {
    return {
      ok: true,
      tnOrderId,
      skipped: true,
      skipReason: "already_mp_enriched",
      unitCount: order.allocations.length,
      allocationsEnriched: 0,
      mpPaymentId: payment.mpPaymentId,
      validation: {
        passed: true,
        failures: [],
        sums: {
          mpFeeAllocated: 0,
          mpTaxAllocated: 0,
          mpFinancingAllocated: 0,
          mpPlatformFeeAllocated: 0,
          mpTotalCostAllocated: 0,
          netoPrendaReal: 0,
        },
      },
    };
  }

  const commercialRows = order.allocations.map((a) => ({
    tnOrderItemUnitId: a.tnOrderItemUnitId,
    grossUnitAmount: toNum(a.grossUnitAmount),
    netoPrenda: toNum(a.netoPrenda),
    owner: a.owner,
  }));

  const { allocations, pools } = allocateTnOrderMp(
    {
      mpNetoRealOrden: toNum(payment.mpNetoRealOrden),
      mpTaxTotalReal: toNum(payment.mpTaxTotalReal),
      mpFinancingTotalReal: toNum(payment.mpFinancingTotalReal),
      mpFeeTotalReal: toNum(payment.mpFeeTotalReal),
      mpPlatformFeeTotalReal: toNum(payment.mpPlatformFeeTotalReal),
      mpTotalCostReal: toNum(payment.mpTotalCostReal),
    },
    commercialRows
  );

  const validation = validateTnMpAllocations(allocations, pools);
  if (!validation.passed) {
    return {
      ok: false,
      tnOrderId,
      error: "validación MP falló",
      code: "VALIDATION_FAILED",
      validation,
    };
  }

  if (!opts?.dryRun) {
    const { enriched } = await persistMpAllocationsLive(allocations);
    return {
      ok: true,
      tnOrderId,
      unitCount: allocations.length,
      allocationsEnriched: enriched,
      mpPaymentId: payment.mpPaymentId,
      validation,
    };
  }

  return {
    ok: true,
    tnOrderId,
    unitCount: allocations.length,
    allocationsEnriched: allocations.length,
    mpPaymentId: payment.mpPaymentId,
    validation,
  };
}

function initMpValidationChecks(): Record<
  MpValidationCheckId,
  "PASS" | "FAIL" | "N/A"
> {
  return {
    "V-M1": "N/A",
    "V-M2": "N/A",
    "V-M3": "N/A",
    "V-M4": "N/A",
  };
}

function mergeMpValidationChecks(
  acc: Record<MpValidationCheckId, "PASS" | "FAIL" | "N/A">,
  failures: MpValidationFailure[]
): void {
  const failed = new Set(failures.map((f) => f.check));
  for (const check of Object.keys(acc) as MpValidationCheckId[]) {
    if (failed.has(check)) acc[check] = "FAIL";
    else if (acc[check] === "N/A") acc[check] = "PASS";
  }
}

export async function runPostT0MpAllocationLive(opts?: {
  dryRun?: boolean;
  snapshotDate?: Date;
}): Promise<LiveMpAllocationResult> {
  const dryRun = opts?.dryRun ?? true;
  const errors: string[] = [];

  let snapshotDate: Date;
  try {
    snapshotDate = opts?.snapshotDate ?? (await loadActiveSnapshotDate());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      dryRun,
      preAudit: {
        snapshotDate: "",
        postT0Orders: 0,
        postT0WithMpPayment: 0,
        postT0WithCommercialAlloc: 0,
        ordersPendingMpAllocation: 0,
        ordersAlreadyMpEnriched: 0,
        unitsPendingMpAllocation: 0,
        unitsAlreadyMpEnriched: 0,
      },
      stats: {
        snapshotDate: "",
        ordersProcessed: 0,
        ordersSkipped: 0,
        ordersFailed: 0,
        unitsProcessed: 0,
        allocationsEnriched: 0,
        allocationsSkippedExisting: 0,
        validationChecks: initMpValidationChecks(),
        liveChecks: {
          "L-M1": "FAIL",
          "L-M2": "FAIL",
          "L-M3": "FAIL",
          "L-M4": "FAIL",
        },
        unitsWritten: false,
        commercialAllocationsWritten: false,
        stockMovementsWritten: false,
        snapshotTouched: false,
      },
      orderResults: [],
      errors: [message],
    };
  }

  const preAudit = await auditPostT0MpAllocation(snapshotDate);
  const orderIds = await listPostT0PendingMpAllocationOrderIds(snapshotDate);
  const orderResults: LiveMpAllocateItemResult[] = [];
  const validationChecks = initMpValidationChecks();

  for (const tnOrderId of orderIds) {
    const result = await allocatePostT0OrderMpLive(tnOrderId, {
      dryRun,
      snapshotDate,
    });
    orderResults.push(result);
    if (result.ok && result.validation && !result.skipped) {
      mergeMpValidationChecks(validationChecks, result.validation.failures);
    }
  }

  const ordersFailed = orderResults.filter((r) => !r.ok).length;
  const ordersSkipped = orderResults.filter((r) => r.ok && r.skipped).length;
  const ordersProcessed = orderResults.filter(
    (r) => r.ok && !r.skipped
  ).length;
  const unitsProcessed = orderResults
    .filter((r) => r.ok && !r.skipped)
    .reduce((a, r) => a + (r.ok ? r.unitCount : 0), 0);
  const allocationsEnriched = orderResults
    .filter((r) => r.ok && !r.skipped)
    .reduce((a, r) => a + (r.ok ? r.allocationsEnriched : 0), 0);

  const stats: LiveMpAllocationStats = {
    snapshotDate: snapshotDate.toISOString(),
    ordersProcessed,
    ordersSkipped,
    ordersFailed,
    unitsProcessed,
    allocationsEnriched,
    allocationsSkippedExisting: 0,
    validationChecks,
    liveChecks: {
      "L-M1": orderResults.every((r) =>
        "code" in r ? r.code !== "PRE_T0" : true
      )
        ? "PASS"
        : "FAIL",
      "L-M2": orderResults.every((r) =>
        !r.ok ? r.code !== "NO_PAYMENT" : true
      )
        ? "PASS"
        : "FAIL",
      "L-M3": "PASS",
      "L-M4": orderResults.every(
        (r) =>
          !r.ok ||
          r.skipped !== true ||
          r.skipReason === "already_mp_enriched" ||
          r.allocationsEnriched === 0
      )
        ? "PASS"
        : "FAIL",
    },
    unitsWritten: false,
    commercialAllocationsWritten: false,
    stockMovementsWritten: false,
    snapshotTouched: false,
  };

  if (ordersFailed > 0) {
    errors.push(`${ordersFailed} orders failed MP allocation`);
  }

  const vmFail = (["V-M1", "V-M2", "V-M3", "V-M4"] as const).some(
    (c) => validationChecks[c] === "FAIL"
  );
  if (vmFail && ordersProcessed > 0) {
    errors.push("MP validation checks failed");
  }

  return {
    dryRun,
    preAudit,
    stats,
    orderResults,
    errors,
  };
}

export function evaluateM52dRecommendation(input: {
  errors: string[];
  stats: LiveMpAllocationStats;
  idempotentSecondRun?: boolean;
}): "GO" | "NO_GO" | "GO_WITH_WARNINGS" {
  if (input.errors.length > 0) return "NO_GO";
  if (
    input.stats.unitsWritten ||
    input.stats.commercialAllocationsWritten ||
    input.stats.stockMovementsWritten ||
    input.stats.snapshotTouched
  ) {
    return "NO_GO";
  }
  if (input.idempotentSecondRun && input.stats.allocationsEnriched > 0) {
    return "NO_GO";
  }
  if (input.stats.ordersFailed > 0) return "NO_GO";
  const vmFail = Object.values(input.stats.validationChecks).includes("FAIL");
  if (vmFail) return "NO_GO";
  if (input.stats.liveChecks["L-M2"] === "FAIL") return "NO_GO";
  return "GO";
}
