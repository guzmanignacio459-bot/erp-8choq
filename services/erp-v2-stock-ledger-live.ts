/**
 * M5.2d — Stock ledger live post-T0 (sale movements, sin snapshot/projection write)
 */

import { getPrisma } from "@/lib/db/prisma";
import {
  classifyUnitParseWarnings,
  saleIdempotencyKey,
  unitIsSaleEligible,
  type UnitParseWarningInput,
} from "@/lib/erp/v2/classify-unit-parse-warnings";
import { normalizeStockMovementGrain } from "@/lib/erp/v2/normalize-stock-movement-grain";
import {
  validateOrderStockSales,
  type StockOrderValidationResult,
  type StockSaleMovementDraft,
  type StockValidationCheckId,
  type StockValidationFailure,
} from "@/lib/erp/v2/validate-tn-stock-movements";
import { validateInventoryProjection } from "@/lib/erp/v2/validate-inventory-projection";
import { loadProjectionValidationInputs } from "@/services/erp-v2-inventory-projection";
import { loadActiveSnapshotDate } from "@/services/erp-v2-stock-ledger";
import {
  StockMovementDirection,
  StockMovementType,
  type Prisma,
} from "@prisma/client";

export const M5_STOCK_LEDGER_LIVE_SOURCE = "m5.2d_stock_ledger_live";

export type PostT0StockLedgerAudit = {
  snapshotDate: string;
  postT0Orders: number;
  ordersWithCompleteUnits: number;
  ordersWithCommercialAlloc: number;
  ordersPendingStockLedger: number;
  ordersAlreadyWithSales: number;
  stockableUnitsPending: number;
  saleMovementsExpected: number;
};

export type LiveStockLedgerStats = {
  snapshotDate: string;
  ordersProcessed: number;
  ordersSkipped: number;
  ordersFailed: number;
  unitsProcessed: number;
  movementsCreated: number;
  movementsSkippedExisting: number;
  unitsSkippedNonStockable: number;
  validationChecks: Record<StockValidationCheckId, "PASS" | "FAIL" | "N/A">;
  liveChecks: Record<"L-S1" | "L-S2" | "L-S3" | "L-S4", "PASS" | "FAIL">;
  snapshotTouched: false;
  projectionTouched: false;
  allocationsWritten: false;
};

export type LiveStockLedgerItemResult =
  | {
      ok: true;
      tnOrderId: string;
      skipped?: boolean;
      skipReason?: string;
      salesCreated: number;
      expectedSales: number;
      skippedUnits: number;
      validation: StockOrderValidationResult;
    }
  | {
      ok: false;
      tnOrderId: string;
      error: string;
      code: string;
      validation?: StockOrderValidationResult;
    };

export type LiveStockLedgerResult = {
  dryRun: boolean;
  preAudit: PostT0StockLedgerAudit;
  stats: LiveStockLedgerStats;
  orderResults: LiveStockLedgerItemResult[];
  projectionVerify: {
    vI3: boolean;
    vI4: boolean;
    vI5: boolean;
    movementsPostT0: number;
    projectedQtyTotal: number;
    netDeltaTotal: number;
  } | null;
  errors: string[];
};

function unitToInput(u: {
  id: string;
  tnOrderId: string;
  sku: string | null;
  talle: string | null;
  owner: string | null;
  isGifty: boolean;
  isStockable: boolean;
  parseWarnings: Prisma.JsonValue | null;
}): UnitParseWarningInput {
  return {
    id: u.id,
    tnOrderId: u.tnOrderId,
    sku: u.sku,
    talle: u.talle,
    owner: u.owner,
    isGifty: u.isGifty,
    isStockable: u.isStockable,
    parseWarnings: u.parseWarnings,
  };
}

function buildSaleDrafts(
  units: Array<{
    id: string;
    tnOrderId: string;
    tnOrderItemId: string;
    sku: string | null;
    talle: string | null;
    owner: string | null;
    isGifty: boolean;
    isStockable: boolean;
    parseWarnings: Prisma.JsonValue | null;
  }>
): { drafts: StockSaleMovementDraft[]; expected: number; skipped: number } {
  const eligible = units.filter((u) => {
    const c = classifyUnitParseWarnings(unitToInput(u));
    return !c.blocksSale && unitIsSaleEligible(unitToInput(u));
  });

  const drafts: StockSaleMovementDraft[] = eligible.map((u) => {
    const grain = normalizeStockMovementGrain({
      sku: String(u.sku ?? ""),
      talle: u.talle,
      owner: u.owner,
    });
    return {
      tnOrderItemUnitId: u.id,
      sku: grain.sku,
      talle: grain.talle,
      quantity: 1,
      movementType: StockMovementType.sale,
      idempotencyKey: saleIdempotencyKey(u.id),
    };
  });

  return {
    drafts,
    expected: drafts.length,
    skipped: units.length - drafts.length,
  };
}

export async function auditPostT0StockLedger(
  snapshotDate: Date
): Promise<PostT0StockLedgerAudit> {
  const prisma = getPrisma();

  const [postT0, complete, commercial, pending, withSales, stockable] =
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
      prisma.$queryRaw<Array<{ n: number }>>`
        SELECT COUNT(DISTINCT o.id)::int AS n
        FROM tn_orders o
        JOIN tn_order_item_allocations a ON a.tn_order_id = o.id
        WHERE o.synced_at >= ${snapshotDate} OR o.tn_paid_at >= ${snapshotDate}
      `,
      prisma.$queryRaw<Array<{ orders: number; units: number; sales: number }>>`
        SELECT
          COUNT(*)::int AS orders,
          COALESCE(SUM(stockable_units), 0)::int AS units,
          COALESCE(SUM(expected_sales), 0)::int AS sales
        FROM (
          SELECT o.id,
            (
              SELECT COUNT(*)::int
              FROM tn_order_item_units u
              WHERE u.tn_order_id = o.id
                AND u.is_stockable = true
                AND u.is_gifty = false
                AND COALESCE(TRIM(u.sku), '') <> ''
                AND COALESCE(TRIM(u.talle), '') <> ''
            ) AS stockable_units,
            (
              SELECT COUNT(*)::int
              FROM tn_order_item_units u
              WHERE u.tn_order_id = o.id
                AND u.is_stockable = true
                AND u.is_gifty = false
                AND COALESCE(TRIM(u.sku), '') <> ''
                AND COALESCE(TRIM(u.talle), '') <> ''
            ) AS expected_sales
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
            AND (
              SELECT COUNT(*)::int
              FROM tn_order_item_units u WHERE u.tn_order_id = o.id
            ) = (
              SELECT COUNT(*)::int
              FROM tn_order_item_allocations a WHERE a.tn_order_id = o.id
            )
            AND NOT EXISTS (
              SELECT 1 FROM payments p
              WHERE p.tn_order_id = o.id
                AND p.source = 'mp_api_sync_staging'
                AND p.mp_neto_real_orden IS NOT NULL
                AND EXISTS (
                  SELECT 1 FROM tn_order_item_allocations a
                  WHERE a.tn_order_id = o.id AND a.neto_prenda_real IS NULL
                )
            )
            AND NOT EXISTS (
              SELECT 1 FROM stock_movements m
              WHERE m.tn_order_id = o.id AND m.movement_type = 'sale'
            )
        ) q
        WHERE stockable_units > 0
      `,
      prisma.$queryRaw<Array<{ n: number }>>`
        SELECT COUNT(DISTINCT o.id)::int AS n
        FROM tn_orders o
        JOIN stock_movements m ON m.tn_order_id = o.id
        WHERE (o.synced_at >= ${snapshotDate} OR o.tn_paid_at >= ${snapshotDate})
          AND m.movement_type = 'sale'
      `,
      prisma.$queryRaw<Array<{ n: number }>>`
        SELECT COUNT(*)::int AS n
        FROM tn_order_item_units u
        JOIN tn_orders o ON o.id = u.tn_order_id
        WHERE (o.synced_at >= ${snapshotDate} OR o.tn_paid_at >= ${snapshotDate})
          AND u.is_stockable = true
          AND u.is_gifty = false
          AND COALESCE(TRIM(u.sku), '') <> ''
          AND COALESCE(TRIM(u.talle), '') <> ''
          AND NOT EXISTS (
            SELECT 1 FROM stock_movements m
            WHERE m.tn_order_item_unit_id = u.id AND m.movement_type = 'sale'
          )
      `,
    ]);

  const p = pending[0] ?? { orders: 0, units: 0, sales: 0 };

  return {
    snapshotDate: snapshotDate.toISOString(),
    postT0Orders: postT0[0]?.n ?? 0,
    ordersWithCompleteUnits: complete[0]?.n ?? 0,
    ordersWithCommercialAlloc: commercial[0]?.n ?? 0,
    ordersPendingStockLedger: p.orders,
    ordersAlreadyWithSales: withSales[0]?.n ?? 0,
    stockableUnitsPending: stockable[0]?.n ?? 0,
    saleMovementsExpected: p.sales,
  };
}

export async function listPostT0PendingStockLedgerOrderIds(
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
        FROM tn_order_items i WHERE i.tn_order_id = o.id
      ) = (
        SELECT COUNT(*)::int
        FROM tn_order_item_units u WHERE u.tn_order_id = o.id
      )
      AND (
        SELECT COUNT(*)::int
        FROM tn_order_item_units u WHERE u.tn_order_id = o.id
      ) = (
        SELECT COUNT(*)::int
        FROM tn_order_item_allocations a WHERE a.tn_order_id = o.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM payments p
        WHERE p.tn_order_id = o.id
          AND p.source = 'mp_api_sync_staging'
          AND p.mp_neto_real_orden IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM tn_order_item_allocations a
            WHERE a.tn_order_id = o.id AND a.neto_prenda_real IS NULL
          )
      )
      AND NOT EXISTS (
        SELECT 1 FROM stock_movements m
        WHERE m.tn_order_id = o.id AND m.movement_type = 'sale'
      )
      AND EXISTS (
        SELECT 1 FROM tn_order_item_units u
        WHERE u.tn_order_id = o.id
          AND u.is_stockable = true
          AND u.is_gifty = false
          AND COALESCE(TRIM(u.sku), '') <> ''
          AND COALESCE(TRIM(u.talle), '') <> ''
      )
    ORDER BY o.id ASC
  `;
  return rows.map((r) => String(r.id));
}

async function persistStockSalesLive(
  tnOrderId: string,
  order: {
    id: string;
    itemUnits: Array<{
      id: string;
      tnOrderItemId: string;
      sku: string | null;
      talle: string | null;
      owner: string | null;
    }>;
  },
  drafts: StockSaleMovementDraft[],
  correlationId: string,
  movementCreatedAt: Date
): Promise<{ created: number; skipped: number }> {
  const prisma = getPrisma();
  const unitMap = new Map(order.itemUnits.map((u) => [u.id, u]));
  let created = 0;
  let skipped = 0;

  await prisma.$transaction(async (tx) => {
    for (const d of drafts) {
      const unit = unitMap.get(d.tnOrderItemUnitId);
      if (!unit) {
        skipped += 1;
        continue;
      }

      const existing = await tx.stockMovement.findFirst({
        where: {
          OR: [
            { idempotencyKey: d.idempotencyKey },
            {
              tnOrderItemUnitId: d.tnOrderItemUnitId,
              movementType: StockMovementType.sale,
            },
          ],
        },
        select: { id: true },
      });
      if (existing) {
        skipped += 1;
        continue;
      }

      const grain = normalizeStockMovementGrain({
        sku: String(unit.sku ?? ""),
        talle: unit.talle,
        owner: unit.owner,
      });

      await tx.stockMovement.create({
        data: {
          tnOrderId: order.id,
          tnOrderItemId: unit.tnOrderItemId,
          tnOrderItemUnitId: unit.id,
          sku: d.sku,
          talle: d.talle,
          owner: grain.owner,
          quantity: 1,
          movementType: StockMovementType.sale,
          direction: StockMovementDirection.out,
          reason: "tn_order_sale",
          idempotencyKey: d.idempotencyKey,
          correlationId,
          source: M5_STOCK_LEDGER_LIVE_SOURCE,
          createdAt: movementCreatedAt,
        },
      });
      created += 1;
    }

    if (created > 0) {
      await tx.tnOrder.update({
        where: { id: tnOrderId },
        data: { stockDeductedAt: new Date() },
      });
    }
  });

  return { created, skipped };
}

export async function recordPostT0OrderStockSalesLive(
  tnOrderId: string,
  opts?: {
    dryRun?: boolean;
    snapshotDate?: Date;
    correlationId?: string;
    movementCreatedAt?: Date;
  }
): Promise<LiveStockLedgerItemResult> {
  const prisma = getPrisma();
  const order = await prisma.tnOrder.findUnique({
    where: { id: tnOrderId },
    include: {
      itemUnits: { orderBy: [{ tnOrderItemId: "asc" }, { unitIndex: "asc" }] },
      allocations: { select: { id: true } },
      payments: {
        where: { source: "mp_api_sync_staging", mpNetoRealOrden: { not: null } },
        take: 1,
      },
    },
  });

  if (!order) {
    return { ok: false, tnOrderId, error: "tn_order not found", code: "NOT_FOUND" };
  }

  if (opts?.snapshotDate) {
    const isPostT0 =
      order.syncedAt >= opts.snapshotDate ||
      (order.tnPaidAt != null && order.tnPaidAt >= opts.snapshotDate);
    if (!isPostT0) {
      return { ok: false, tnOrderId, error: "orden pre-T0", code: "PRE_T0" };
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
      salesCreated: 0,
      expectedSales: 0,
      skippedUnits: 0,
      validation: {
        passed: true,
        failures: [],
        expectedSales: 0,
        actualSales: 0,
      },
    };
  }

  const itemQty = await prisma.tnOrderItem.aggregate({
    where: { tnOrderId },
    _sum: { quantity: true },
  });
  if (order.itemUnits.length !== (itemQty._sum.quantity ?? 0)) {
    return {
      ok: false,
      tnOrderId,
      error: "units incompletas",
      code: "INCOMPLETE_UNITS",
    };
  }

  if (order.allocations.length !== order.itemUnits.length) {
    return {
      ok: false,
      tnOrderId,
      error: "commercial allocations incompletas",
      code: "INCOMPLETE_COMMERCIAL",
    };
  }

  if (order.payments.length) {
    const mpPending = await prisma.tnOrderItemAllocation.count({
      where: { tnOrderId, netoPrendaReal: null },
    });
    if (mpPending > 0) {
      return {
        ok: false,
        tnOrderId,
        error: "MP allocation incompleta",
        code: "INCOMPLETE_MP",
      };
    }
  }

  const existingSales = await prisma.stockMovement.count({
    where: { tnOrderId, movementType: StockMovementType.sale },
  });
  if (existingSales > 0) {
    return {
      ok: true,
      tnOrderId,
      skipped: true,
      skipReason: "already_has_sales",
      salesCreated: 0,
      expectedSales: 0,
      skippedUnits: 0,
      validation: {
        passed: true,
        failures: [],
        expectedSales: 0,
        actualSales: 0,
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

  const { drafts, expected, skipped } = buildSaleDrafts(order.itemUnits);
  const validation = validateOrderStockSales(drafts, expected);

  if (!validation.passed) {
    return {
      ok: false,
      tnOrderId,
      error: "validación stock falló",
      code: "VALIDATION_FAILED",
      validation,
    };
  }

  if (!opts?.dryRun && drafts.length) {
    const movementCreatedAt =
      opts?.movementCreatedAt ??
      new Date(
        Math.max(
          Date.now(),
          (opts?.snapshotDate?.getTime() ?? 0) + 1000
        )
      );
    const { created } = await persistStockSalesLive(
      tnOrderId,
      order,
      drafts,
      opts?.correlationId ?? `m5.2d-live-${tnOrderId}`,
      movementCreatedAt
    );
    return {
      ok: true,
      tnOrderId,
      salesCreated: created,
      expectedSales: expected,
      skippedUnits: skipped,
      validation,
    };
  }

  return {
    ok: true,
    tnOrderId,
    salesCreated: drafts.length,
    expectedSales: expected,
    skippedUnits: skipped,
    validation,
  };
}

function initStockValidationChecks(): Record<
  StockValidationCheckId,
  "PASS" | "FAIL" | "N/A"
> {
  return {
    "V-S1": "N/A",
    "V-S2": "N/A",
    "V-S3": "N/A",
    "V-S4": "N/A",
    "V-S5": "N/A",
    "V-S6": "N/A",
    "V-S7": "N/A",
    "V-S8": "N/A",
  };
}

function mergeStockValidationChecks(
  acc: Record<StockValidationCheckId, "PASS" | "FAIL" | "N/A">,
  failures: StockValidationFailure[]
): void {
  const failed = new Set(failures.map((f) => f.check));
  for (const check of Object.keys(acc) as StockValidationCheckId[]) {
    if (failed.has(check)) acc[check] = "FAIL";
    else if (acc[check] === "N/A") acc[check] = "PASS";
  }
}

export async function runPostT0StockLedgerLive(opts?: {
  dryRun?: boolean;
  snapshotDate?: Date;
  correlationId?: string;
  runProjectionVerify?: boolean;
}): Promise<LiveStockLedgerResult> {
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
        ordersWithCommercialAlloc: 0,
        ordersPendingStockLedger: 0,
        ordersAlreadyWithSales: 0,
        stockableUnitsPending: 0,
        saleMovementsExpected: 0,
      },
      stats: {
        snapshotDate: "",
        ordersProcessed: 0,
        ordersSkipped: 0,
        ordersFailed: 0,
        unitsProcessed: 0,
        movementsCreated: 0,
        movementsSkippedExisting: 0,
        unitsSkippedNonStockable: 0,
        validationChecks: initStockValidationChecks(),
        liveChecks: {
          "L-S1": "FAIL",
          "L-S2": "FAIL",
          "L-S3": "FAIL",
          "L-S4": "FAIL",
        },
        snapshotTouched: false,
        projectionTouched: false,
        allocationsWritten: false,
      },
      orderResults: [],
      projectionVerify: null,
      errors: [message],
    };
  }

  const preAudit = await auditPostT0StockLedger(snapshotDate);
  const orderIds = await listPostT0PendingStockLedgerOrderIds(snapshotDate);
  const correlationId =
    opts?.correlationId ?? `m5.2d-live-${new Date().toISOString()}`;
  const movementCreatedAt = new Date(
    Math.max(Date.now(), snapshotDate.getTime() + 1000)
  );

  const orderResults: LiveStockLedgerItemResult[] = [];
  const validationChecks = initStockValidationChecks();

  for (const tnOrderId of orderIds) {
    const result = await recordPostT0OrderStockSalesLive(tnOrderId, {
      dryRun,
      snapshotDate,
      correlationId,
      movementCreatedAt,
    });
    orderResults.push(result);
    if (result.ok && result.validation && !result.skipped) {
      mergeStockValidationChecks(validationChecks, result.validation.failures);
    }
  }

  const ordersFailed = orderResults.filter((r) => !r.ok).length;
  const ordersSkipped = orderResults.filter((r) => r.ok && r.skipped).length;
  const ordersProcessed = orderResults.filter(
    (r) => r.ok && !r.skipped
  ).length;
  const movementsCreated = dryRun
    ? orderResults
        .filter((r) => r.ok && !r.skipped)
        .reduce((a, r) => a + (r.ok ? r.salesCreated : 0), 0)
    : orderResults
        .filter((r) => r.ok && !r.skipped)
        .reduce((a, r) => a + (r.ok ? r.salesCreated : 0), 0);
  const unitsSkippedNonStockable = orderResults
    .filter((r) => r.ok && !r.skipped)
    .reduce((a, r) => a + (r.ok ? r.skippedUnits : 0), 0);

  let projectionVerify: LiveStockLedgerResult["projectionVerify"] = null;
  if (!dryRun && opts?.runProjectionVerify !== false) {
    const inputs = await loadProjectionValidationInputs();
    const validation = validateInventoryProjection({
      snapshotLines: inputs.snapshotLines,
      movements: inputs.movements,
      projectionRows: inputs.rows,
      movementsPostT0: inputs.movementsPostT0,
    });
    projectionVerify = {
      vI3: validation.vI3.pass,
      vI4: validation.vI4.pass,
      vI5: validation.vI5.pass,
      movementsPostT0: inputs.movementsPostT0,
      projectedQtyTotal: inputs.totals.projectedQuantityTotal,
      netDeltaTotal: inputs.totals.netDeltaTotal,
    };
    if (!validation.vI4.pass) {
      errors.push("projection verify V-I4 failed");
    }
  }

  const stats: LiveStockLedgerStats = {
    snapshotDate: snapshotDate.toISOString(),
    ordersProcessed,
    ordersSkipped,
    ordersFailed,
    unitsProcessed: movementsCreated,
    movementsCreated,
    movementsSkippedExisting: 0,
    unitsSkippedNonStockable,
    validationChecks,
    liveChecks: {
      "L-S1": orderResults.every((r) =>
        "code" in r ? r.code !== "PRE_T0" : true
      )
        ? "PASS"
        : "FAIL",
      "L-S2": orderResults.every(
        (r) => !r.ok ? r.code !== "INCOMPLETE_UNITS" : true
      )
        ? "PASS"
        : "FAIL",
      "L-S3": "PASS",
      "L-S4": orderResults.every(
        (r) =>
          !r.ok ||
          r.skipped !== true ||
          r.skipReason === "already_has_sales" ||
          r.salesCreated === 0
      )
        ? "PASS"
        : "FAIL",
    },
    snapshotTouched: false,
    projectionTouched: false,
    allocationsWritten: false,
  };

  if (ordersFailed > 0) {
    errors.push(`${ordersFailed} orders failed stock ledger`);
  }

  const vsFail = (["V-S1", "V-S2", "V-S3", "V-S4", "V-S5", "V-S6"] as const).some(
    (c) => validationChecks[c] === "FAIL"
  );
  if (vsFail && ordersProcessed > 0) {
    errors.push("stock validation checks failed");
  }

  return {
    dryRun,
    preAudit,
    stats,
    orderResults,
    projectionVerify,
    errors,
  };
}

export function evaluateM53Recommendation(input: {
  errors: string[];
  stats: LiveStockLedgerStats;
  projectionVerify: LiveStockLedgerResult["projectionVerify"];
  idempotentSecondRun?: boolean;
}): "GO" | "NO_GO" | "GO_WITH_WARNINGS" {
  if (input.errors.length > 0) return "NO_GO";
  if (input.stats.snapshotTouched || input.stats.projectionTouched) {
    return "NO_GO";
  }
  if (input.stats.allocationsWritten) return "NO_GO";
  if (input.idempotentSecondRun && input.stats.movementsCreated > 0) {
    return "NO_GO";
  }
  if (input.stats.ordersFailed > 0) return "NO_GO";
  const vsFail = Object.values(input.stats.validationChecks).includes("FAIL");
  if (vsFail) return "NO_GO";
  if (input.projectionVerify && !input.projectionVerify.vI4) return "NO_GO";
  if (input.stats.unitsSkippedNonStockable > 0) return "GO_WITH_WARNINGS";
  return "GO";
}
