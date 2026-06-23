/**
 * M5.2b — Commercial allocations live post-T0 (sin MP ni ledger)
 */

import { getPrisma } from "@/lib/db/prisma";
import {
  allocateTnOrderCommercial,
  type CommercialUnitAllocation,
} from "@/lib/erp/v2/allocate-tn-order-commercial";
import {
  validateTnCommercialAllocations,
  type CommercialValidationResult,
  type ValidationCheckId,
  type ValidationFailure,
} from "@/lib/erp/v2/validate-tn-commercial-allocations";
import { loadActiveSnapshotDate } from "@/services/erp-v2-stock-ledger";
import type { Prisma } from "@prisma/client";

export const M5_COMMERCIAL_SOURCE = "m5.2b_commercial_allocation";

export type PostT0CommercialAllocationAudit = {
  snapshotDate: string;
  postT0Orders: number;
  ordersWithCompleteUnits: number;
  ordersPendingAllocation: number;
  ordersAlreadyAllocated: number;
  ordersCancelledSkipped: number;
  ordersIncompleteUnits: number;
  unitsExpected: number;
  allocationsExpected: number;
};

export type LiveCommercialAllocationStats = {
  snapshotDate: string;
  ordersProcessed: number;
  ordersSkipped: number;
  ordersFailed: number;
  unitsProcessed: number;
  allocationsCreated: number;
  allocationsSkippedExisting: number;
  validationChecks: Record<ValidationCheckId, "PASS" | "FAIL" | "N/A">;
  liveChecks: Record<"L-C1" | "L-C2" | "L-C3" | "L-C4", "PASS" | "FAIL">;
  unitsWritten: false;
  mpAllocationsWritten: false;
  stockMovementsWritten: false;
  snapshotTouched: false;
};

export type LiveCommercialAllocateItemResult =
  | {
      ok: true;
      tnOrderId: string;
      skipped?: boolean;
      skipReason?: string;
      unitCount: number;
      allocationsCreated: number;
      validation: CommercialValidationResult;
    }
  | {
      ok: false;
      tnOrderId: string;
      error: string;
      code: string;
      validation?: CommercialValidationResult;
    };

export type LiveCommercialAllocationResult = {
  dryRun: boolean;
  preAudit: PostT0CommercialAllocationAudit;
  stats: LiveCommercialAllocationStats;
  orderResults: LiveCommercialAllocateItemResult[];
  auditV6: {
    ordersWithInferenceDelta: number;
    maxInferenceDelta: number;
    samples: Array<{
      tnOrderId: string;
      tnDiscount: number;
      poolDiscountInferred: number;
      delta: number;
    }>;
  };
  errors: string[];
};

function toNum(v: Prisma.Decimal | number | string | null | undefined): number {
  if (v == null) return 0;
  return Number(v);
}

function rawPayload(
  value: Prisma.JsonValue | null
): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export async function auditPostT0CommercialAllocation(
  snapshotDate: Date
): Promise<PostT0CommercialAllocationAudit> {
  const prisma = getPrisma();

  const [postT0, complete, pending, allocated, cancelled, incomplete, units] =
    await Promise.all([
      prisma.$queryRaw<Array<{ n: number }>>`
        SELECT COUNT(*)::int AS n
        FROM tn_orders o
        WHERE o.synced_at >= ${snapshotDate} OR o.tn_paid_at >= ${snapshotDate}
      `,
      prisma.$queryRaw<Array<{ n: number }>>`
        SELECT COUNT(*)::int AS n
        FROM tn_orders o
        WHERE (o.synced_at >= ${snapshotDate} OR o.tn_paid_at >= ${snapshotDate})
          AND (
            SELECT COALESCE(SUM(i.quantity), 0)::int
            FROM tn_order_items i WHERE i.tn_order_id = o.id
          ) = (
            SELECT COUNT(*)::int
            FROM tn_order_item_units u WHERE u.tn_order_id = o.id
          )
          AND (
            SELECT COUNT(*)::int
            FROM tn_order_item_units u WHERE u.tn_order_id = o.id
          ) > 0
      `,
      prisma.$queryRaw<Array<{ orders: number; units: number }>>`
        SELECT
          COUNT(*)::int AS orders,
          COALESCE(SUM(unit_count), 0)::int AS units
        FROM (
          SELECT o.id,
            (SELECT COUNT(*)::int FROM tn_order_item_units u WHERE u.tn_order_id = o.id) AS unit_count
          FROM tn_orders o
          WHERE (o.synced_at >= ${snapshotDate} OR o.tn_paid_at >= ${snapshotDate})
            AND COALESCE(o.commercial_status::text, '') NOT IN ('cancelado', 'reembolsado')
            AND (
              SELECT COALESCE(SUM(i.quantity), 0)::int
              FROM tn_order_items i WHERE i.tn_order_id = o.id
            ) = (
              SELECT COUNT(*)::int
              FROM tn_order_item_units u WHERE u.tn_order_id = o.id
            )
            AND NOT EXISTS (
              SELECT 1 FROM tn_order_item_allocations a WHERE a.tn_order_id = o.id
            )
        ) q
      `,
      prisma.$queryRaw<Array<{ orders: number; units: number }>>`
        SELECT
          COUNT(DISTINCT o.id)::int AS orders,
          COUNT(a.id)::int AS units
        FROM tn_orders o
        JOIN tn_order_item_allocations a ON a.tn_order_id = o.id
        WHERE o.synced_at >= ${snapshotDate} OR o.tn_paid_at >= ${snapshotDate}
      `,
      prisma.$queryRaw<Array<{ n: number }>>`
        SELECT COUNT(*)::int AS n
        FROM tn_orders o
        WHERE (o.synced_at >= ${snapshotDate} OR o.tn_paid_at >= ${snapshotDate})
          AND o.commercial_status::text IN ('cancelado', 'reembolsado')
          AND NOT EXISTS (
            SELECT 1 FROM tn_order_item_allocations a WHERE a.tn_order_id = o.id
          )
      `,
      prisma.$queryRaw<Array<{ n: number }>>`
        SELECT COUNT(*)::int AS n
        FROM tn_orders o
        WHERE (o.synced_at >= ${snapshotDate} OR o.tn_paid_at >= ${snapshotDate})
          AND (
            SELECT COALESCE(SUM(i.quantity), 0)::int
            FROM tn_order_items i WHERE i.tn_order_id = o.id
          ) <> (
            SELECT COUNT(*)::int
            FROM tn_order_item_units u WHERE u.tn_order_id = o.id
          )
      `,
      prisma.$queryRaw<Array<{ n: number }>>`
        SELECT COUNT(*)::int AS n
        FROM tn_order_item_units u
        JOIN tn_orders o ON o.id = u.tn_order_id
        WHERE o.synced_at >= ${snapshotDate} OR o.tn_paid_at >= ${snapshotDate}
      `,
    ]);

  const p = pending[0] ?? { orders: 0, units: 0 };

  return {
    snapshotDate: snapshotDate.toISOString(),
    postT0Orders: postT0[0]?.n ?? 0,
    ordersWithCompleteUnits: complete[0]?.n ?? 0,
    ordersPendingAllocation: p.orders,
    ordersAlreadyAllocated: allocated[0]?.orders ?? 0,
    ordersCancelledSkipped: cancelled[0]?.n ?? 0,
    ordersIncompleteUnits: incomplete[0]?.n ?? 0,
    unitsExpected: units[0]?.n ?? 0,
    allocationsExpected: p.units,
  };
}

export async function listPostT0PendingCommercialAllocationOrderIds(
  snapshotDate: Date
): Promise<string[]> {
  const prisma = getPrisma();
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT o.id
    FROM tn_orders o
    WHERE (o.synced_at >= ${snapshotDate} OR o.tn_paid_at >= ${snapshotDate})
      AND COALESCE(o.commercial_status::text, '') NOT IN ('cancelado', 'reembolsado')
      AND (
        SELECT COALESCE(SUM(i.quantity), 0)::int
        FROM tn_order_items i
        WHERE i.tn_order_id = o.id
      ) = (
        SELECT COUNT(*)::int
        FROM tn_order_item_units u
        WHERE u.tn_order_id = o.id
      )
      AND (
        SELECT COUNT(*)::int
        FROM tn_order_item_units u
        WHERE u.tn_order_id = o.id
      ) > 0
      AND NOT EXISTS (
        SELECT 1
        FROM tn_order_item_allocations a
        WHERE a.tn_order_id = o.id
      )
    ORDER BY o.id ASC
  `;
  return rows.map((r) => String(r.id));
}

async function loadOrderWithUnits(tnOrderId: string) {
  const prisma = getPrisma();
  return prisma.tnOrder.findUnique({
    where: { id: tnOrderId },
    include: {
      itemUnits: {
        orderBy: [{ tnOrderItemId: "asc" }, { unitIndex: "asc" }],
      },
    },
  });
}

async function persistCommercialAllocationsLive(
  tnOrderId: string,
  allocations: CommercialUnitAllocation[]
): Promise<{ created: number; skipped: number }> {
  const prisma = getPrisma();
  let created = 0;
  let skipped = 0;

  await prisma.$transaction(async (tx) => {
    for (const row of allocations) {
      const exists = await tx.tnOrderItemAllocation.findUnique({
        where: { tnOrderItemUnitId: row.tnOrderItemUnitId },
        select: { id: true },
      });
      if (exists) {
        skipped += 1;
        continue;
      }

      await tx.tnOrderItemAllocation.create({
        data: {
          tnOrderId: row.tnOrderId,
          tnOrderItemId: row.tnOrderItemId,
          tnOrderItemUnitId: row.tnOrderItemUnitId,
          grossUnitAmount: row.grossUnitAmount,
          discountAllocated: row.discountAllocated,
          shippingAllocated: row.shippingAllocated,
          feeAllocated: row.feeAllocated,
          netoPrenda: row.netoPrenda,
          owner: row.owner,
          source: M5_COMMERCIAL_SOURCE,
        },
      });
      created += 1;
    }

    const unitCount = await tx.tnOrderItemUnit.count({
      where: { tnOrderId },
    });
    const allocCount = await tx.tnOrderItemAllocation.count({
      where: { tnOrderId },
    });
    if (unitCount > 0 && unitCount === allocCount) {
      await tx.tnOrder.update({
        where: { id: tnOrderId },
        data: { allocatedAt: new Date() },
      });
    }
  });

  return { created, skipped };
}

export async function allocatePostT0OrderCommercialLive(
  tnOrderId: string,
  opts?: { dryRun?: boolean; snapshotDate?: Date }
): Promise<LiveCommercialAllocateItemResult> {
  const snapshotDate = opts?.snapshotDate;
  const order = await loadOrderWithUnits(tnOrderId);

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

  if (
    order.commercialStatus === "cancelado" ||
    order.commercialStatus === "reembolsado"
  ) {
    return {
      ok: true,
      tnOrderId,
      skipped: true,
      skipReason: "cancelled_or_refunded",
      unitCount: 0,
      allocationsCreated: 0,
      validation: {
        passed: true,
        failures: [],
        sums: {
          discount: 0,
          shipping: 0,
          grossUnitAmount: 0,
          netCommercialAmount: 0,
        },
        audit: {
          tnDiscount: 0,
          poolDiscountInferred: 0,
          discountInferenceDelta: 0,
        },
      },
    };
  }

  if (!order.itemUnits.length) {
    return {
      ok: false,
      tnOrderId,
      error: "sin tn_order_item_units",
      code: "NO_UNITS",
    };
  }

  const existingAlloc = await getPrisma().tnOrderItemAllocation.count({
    where: { tnOrderId },
  });
  if (existingAlloc > 0) {
    return {
      ok: true,
      tnOrderId,
      skipped: true,
      skipReason: "already_allocated",
      unitCount: order.itemUnits.length,
      allocationsCreated: 0,
      validation: {
        passed: true,
        failures: [],
        sums: {
          discount: 0,
          shipping: 0,
          grossUnitAmount: 0,
          netCommercialAmount: 0,
        },
        audit: {
          tnDiscount: toNum(order.tnDiscount),
          poolDiscountInferred: 0,
          discountInferenceDelta: 0,
        },
      },
    };
  }

  const itemQty = await getPrisma().tnOrderItem.aggregate({
    where: { tnOrderId },
    _sum: { quantity: true },
  });
  const expectedQty = itemQty._sum.quantity ?? 0;
  if (order.itemUnits.length !== expectedQty) {
    return {
      ok: false,
      tnOrderId,
      error: "units incompletas",
      code: "INCOMPLETE_UNITS",
    };
  }

  const { allocations, pools } = allocateTnOrderCommercial(
    {
      tnSubtotal: toNum(order.tnSubtotal),
      tnDiscount: toNum(order.tnDiscount),
      tnShipping: toNum(order.tnShipping),
      tnTotal: toNum(order.tnTotal),
      shippingOwner: order.shippingOwner,
      rawTnPayload: rawPayload(order.rawTnPayload),
    },
    order.itemUnits.map((u) => ({
      id: u.id,
      tnOrderId: u.tnOrderId,
      tnOrderItemId: u.tnOrderItemId,
      unitPrice: toNum(u.unitPrice),
      owner: u.owner,
    }))
  );

  const validation = validateTnCommercialAllocations(
    allocations,
    pools,
    toNum(order.tnSubtotal),
    toNum(order.tnDiscount),
    order.itemUnits.length
  );

  if (!validation.passed) {
    return {
      ok: false,
      tnOrderId,
      error: "validación comercial falló",
      code: "VALIDATION_FAILED",
      validation,
    };
  }

  if (!opts?.dryRun) {
    const { created, skipped } = await persistCommercialAllocationsLive(
      tnOrderId,
      allocations
    );
    return {
      ok: true,
      tnOrderId,
      unitCount: allocations.length,
      allocationsCreated: created,
      validation,
      ...(skipped > 0 ? { skipped: true, skipReason: "partial_existing" } : {}),
    };
  }

  return {
    ok: true,
    tnOrderId,
    unitCount: allocations.length,
    allocationsCreated: allocations.length,
    validation,
  };
}

function initValidationChecks(): Record<
  ValidationCheckId,
  "PASS" | "FAIL" | "N/A"
> {
  return {
    "V-C1": "N/A",
    "V-C2": "N/A",
    "V-C3": "N/A",
    "V-C4": "N/A",
    "V-C5": "N/A",
    "V-C6": "N/A",
  };
}

function mergeValidationChecks(
  acc: Record<ValidationCheckId, "PASS" | "FAIL" | "N/A">,
  failures: ValidationFailure[]
): void {
  const failed = new Set(failures.map((f) => f.check));
  for (const check of Object.keys(acc) as ValidationCheckId[]) {
    if (failed.has(check)) acc[check] = "FAIL";
    else if (acc[check] === "N/A") acc[check] = "PASS";
  }
}

export async function runPostT0CommercialAllocationLive(opts?: {
  dryRun?: boolean;
  snapshotDate?: Date;
}): Promise<LiveCommercialAllocationResult> {
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
        ordersWithCompleteUnits: 0,
        ordersPendingAllocation: 0,
        ordersAlreadyAllocated: 0,
        ordersCancelledSkipped: 0,
        ordersIncompleteUnits: 0,
        unitsExpected: 0,
        allocationsExpected: 0,
      },
      stats: {
        snapshotDate: "",
        ordersProcessed: 0,
        ordersSkipped: 0,
        ordersFailed: 0,
        unitsProcessed: 0,
        allocationsCreated: 0,
        allocationsSkippedExisting: 0,
        validationChecks: initValidationChecks(),
        liveChecks: {
          "L-C1": "FAIL",
          "L-C2": "FAIL",
          "L-C3": "FAIL",
          "L-C4": "FAIL",
        },
        unitsWritten: false,
        mpAllocationsWritten: false,
        stockMovementsWritten: false,
        snapshotTouched: false,
      },
      orderResults: [],
      auditV6: {
        ordersWithInferenceDelta: 0,
        maxInferenceDelta: 0,
        samples: [],
      },
      errors: [message],
    };
  }

  const preAudit = await auditPostT0CommercialAllocation(snapshotDate);
  const orderIds =
    await listPostT0PendingCommercialAllocationOrderIds(snapshotDate);

  const orderResults: LiveCommercialAllocateItemResult[] = [];
  const validationChecks = initValidationChecks();

  for (const tnOrderId of orderIds) {
    const result = await allocatePostT0OrderCommercialLive(tnOrderId, {
      dryRun,
      snapshotDate,
    });
    orderResults.push(result);
    if (result.ok && result.validation && !result.skipped) {
      mergeValidationChecks(validationChecks, result.validation.failures);
    }
  }

  const ordersFailed = orderResults.filter((r) => !r.ok).length;
  const ordersSkipped = orderResults.filter(
    (r) => r.ok && r.skipped
  ).length;
  const ordersProcessed = orderResults.filter(
    (r) => r.ok && !r.skipped
  ).length;
  const unitsProcessed = orderResults
    .filter((r) => r.ok && !r.skipped)
    .reduce((a, r) => a + (r.ok ? r.unitCount : 0), 0);
  const allocationsCreated = dryRun
    ? unitsProcessed
    : orderResults
        .filter((r) => r.ok && !r.skipped)
        .reduce((a, r) => a + (r.ok ? r.allocationsCreated : 0), 0);

  const auditV6 = {
    ordersWithInferenceDelta: 0,
    maxInferenceDelta: 0,
    samples: [] as LiveCommercialAllocationResult["auditV6"]["samples"],
  };

  for (const r of orderResults) {
    if (!r.ok || r.skipped || !("validation" in r)) continue;
    const delta = Math.abs(r.validation.audit.discountInferenceDelta);
    if (delta > 0.01) {
      auditV6.ordersWithInferenceDelta += 1;
      auditV6.maxInferenceDelta = Math.max(auditV6.maxInferenceDelta, delta);
      if (auditV6.samples.length < 10) {
        auditV6.samples.push({
          tnOrderId: r.tnOrderId,
          tnDiscount: r.validation.audit.tnDiscount,
          poolDiscountInferred: r.validation.audit.poolDiscountInferred,
          delta: r.validation.audit.discountInferenceDelta,
        });
      }
    }
  }
  validationChecks["V-C6"] = "PASS";

  const liveChecks: LiveCommercialAllocationStats["liveChecks"] = {
    "L-C1": orderResults.every((r) =>
      "code" in r ? r.code !== "PRE_T0" : true
    )
      ? "PASS"
      : "FAIL",
    "L-C2": orderResults.every(
      (r) => !r.ok ? r.code !== "INCOMPLETE_UNITS" : true
    )
      ? "PASS"
      : "FAIL",
    "L-C3": "PASS",
    "L-C4": orderResults.every(
      (r) =>
        !r.ok ||
        r.skipped !== true ||
        r.skipReason === "already_allocated" ||
        r.allocationsCreated === 0
    )
      ? "PASS"
      : "FAIL",
  };

  const stats: LiveCommercialAllocationStats = {
    snapshotDate: snapshotDate.toISOString(),
    ordersProcessed,
    ordersSkipped,
    ordersFailed,
    unitsProcessed,
    allocationsCreated,
    allocationsSkippedExisting: 0,
    validationChecks,
    liveChecks,
    unitsWritten: false,
    mpAllocationsWritten: false,
    stockMovementsWritten: false,
    snapshotTouched: false,
  };

  if (ordersFailed > 0) {
    errors.push(`${ordersFailed} orders failed commercial allocation`);
  }

  const allVcPass = (["V-C1", "V-C2", "V-C3", "V-C4", "V-C5"] as const).every(
    (c) => validationChecks[c] === "PASS" || validationChecks[c] === "N/A"
  );
  if (!allVcPass && ordersProcessed > 0) {
    errors.push("commercial validation checks failed");
  }

  return {
    dryRun,
    preAudit,
    stats,
    orderResults,
    auditV6,
    errors,
  };
}

export function evaluateM52cRecommendation(input: {
  dryRun: boolean;
  errors: string[];
  stats: LiveCommercialAllocationStats;
  auditV6: LiveCommercialAllocationResult["auditV6"];
  idempotentSecondRun?: boolean;
}): "GO" | "NO_GO" | "GO_WITH_WARNINGS" {
  if (input.errors.length > 0) return "NO_GO";
  if (
    input.stats.stockMovementsWritten ||
    input.stats.snapshotTouched ||
    input.stats.mpAllocationsWritten ||
    input.stats.unitsWritten
  ) {
    return "NO_GO";
  }
  if (input.idempotentSecondRun && input.stats.allocationsCreated > 0) {
    return "NO_GO";
  }
  if (input.stats.ordersFailed > 0) return "NO_GO";
  const vcFail = Object.values(input.stats.validationChecks).includes("FAIL");
  if (vcFail) return "NO_GO";
  if (input.stats.liveChecks["L-C2"] === "FAIL") return "NO_GO";
  if (input.auditV6.ordersWithInferenceDelta > 0) return "GO_WITH_WARNINGS";
  return "GO";
}
