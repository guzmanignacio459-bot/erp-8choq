import { getPrisma } from "@/lib/db/prisma";
import {
  classifyUnitParseWarnings,
  saleIdempotencyKey,
  summarizeParseWarningsAudit,
  unitIsSaleEligible,
  type ParseWarningsAuditReport,
  type UnitParseWarningInput,
} from "@/lib/erp/v2/classify-unit-parse-warnings";
import { normalizeStockMovementGrain } from "@/lib/erp/v2/normalize-stock-movement-grain";
import { projectionKey } from "@/lib/erp/v2/compute-inventory-projection";
import {
  validateOrderStockSales,
  validatePilotCoverage,
  type StockOrderValidationResult,
  type StockSaleMovementDraft,
  type StockValidationFailure,
} from "@/lib/erp/v2/validate-tn-stock-movements";
import {
  StockMovementDirection,
  StockMovementType,
  type Prisma,
} from "@prisma/client";

export const STOCK_LEDGER_SOURCE = "m4_stock_ledger";

export type StockLedgerItemSuccess = {
  ok: true;
  tnOrderId: string;
  salesCreated: number;
  expectedSales: number;
  skippedUnits: number;
  validation: StockOrderValidationResult;
};

export type StockLedgerItemFailure = {
  ok: false;
  tnOrderId: string;
  error: string;
  code: string;
  validation?: StockOrderValidationResult;
};

export type StockLedgerItemResult =
  | StockLedgerItemSuccess
  | StockLedgerItemFailure;

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

export async function auditParseWarningsTnOnly(): Promise<{
  tnOnly: ParseWarningsAuditReport;
  global: ParseWarningsAuditReport;
}> {
  const prisma = getPrisma();
  const rows = await prisma.tnOrderItemUnit.findMany({
    select: {
      id: true,
      tnOrderId: true,
      sku: true,
      talle: true,
      owner: true,
      isGifty: true,
      isStockable: true,
      parseWarnings: true,
      tnOrder: { select: { erpOrder: { select: { id: true } } } },
    },
  });

  const all = rows.map((r) => unitToInput(r));
  const tnOnly = rows
    .filter((r) => !r.tnOrder.erpOrder)
    .map((r) => unitToInput(r));

  return {
    global: summarizeParseWarningsAudit(all, "global"),
    tnOnly: summarizeParseWarningsAudit(tnOnly, "tn_only"),
  };
}

export async function listTnOnlyStockPilotOrderIds(
  limit = 25
): Promise<string[]> {
  const prisma = getPrisma();
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT o.id
    FROM tn_orders o
    LEFT JOIN erp_orders e ON e.tn_order_id = o.id
    WHERE e.id IS NULL
      AND EXISTS (
        SELECT 1 FROM tn_order_item_units u WHERE u.tn_order_id = o.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM stock_movements m
        WHERE m.tn_order_id = o.id AND m.movement_type = 'sale'
      )
    ORDER BY o.id ASC
    LIMIT ${limit}
  `;
  return rows.map((r) => String(r.id));
}

export async function listTnOnlyOrderIds(): Promise<string[]> {
  const prisma = getPrisma();
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT o.id
    FROM tn_orders o
    LEFT JOIN erp_orders e ON e.tn_order_id = o.id
    WHERE e.id IS NULL
    ORDER BY o.id ASC
  `;
  return rows.map((r) => String(r.id));
}

export async function listTnOnlyStockBackfillOrderIds(): Promise<string[]> {
  const prisma = getPrisma();
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT o.id
    FROM tn_orders o
    LEFT JOIN erp_orders e ON e.tn_order_id = o.id
    WHERE e.id IS NULL
      AND EXISTS (
        SELECT 1
        FROM tn_order_item_units u
        WHERE u.tn_order_id = o.id
          AND u.is_stockable = true
          AND u.is_gifty = false
          AND COALESCE(TRIM(u.sku), '') <> ''
          AND COALESCE(TRIM(u.talle), '') <> ''
      )
      AND NOT EXISTS (
        SELECT 1 FROM stock_movements m
        WHERE m.tn_order_id = o.id
          AND m.movement_type = 'sale'
          AND m.source = ${STOCK_LEDGER_SOURCE}
      )
    ORDER BY o.id ASC
  `;
  return rows.map((r) => String(r.id));
}

export type StockBackfillPreAudit = {
  snapshotDate: string;
  tnOnlyOrders: number;
  stockableUnits: number;
  ordersWithSaleMovement: number;
  saleMovementsTotal: number;
  saleMovementsBeforeT0: number;
  saleMovementsAtOrAfterT0: number;
  ordersPendingBackfill: number;
  unitsPendingBackfill: number;
};

export async function auditTnOnlyStockBackfill(
  snapshotDate: Date
): Promise<StockBackfillPreAudit> {
  const prisma = getPrisma();

  const [
    orderCount,
    unitCount,
    movementStats,
    pendingOrders,
    pendingUnits,
  ] = await Promise.all([
    prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count
      FROM tn_orders o
      LEFT JOIN erp_orders e ON e.tn_order_id = o.id
      WHERE e.id IS NULL
    `,
    prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count
      FROM tn_order_item_units u
      JOIN tn_orders o ON o.id = u.tn_order_id
      LEFT JOIN erp_orders e ON e.tn_order_id = o.id
      WHERE e.id IS NULL
        AND u.is_stockable = true
        AND u.is_gifty = false
        AND COALESCE(TRIM(u.sku), '') <> ''
        AND COALESCE(TRIM(u.talle), '') <> ''
    `,
    prisma.$queryRaw<
      Array<{
        orders_with_sale: number;
        sales_total: number;
        sales_before_t0: number;
        sales_at_or_after_t0: number;
      }>
    >`
      SELECT
        COUNT(DISTINCT m.tn_order_id)::int AS orders_with_sale,
        COUNT(m.id)::int AS sales_total,
        COUNT(m.id) FILTER (WHERE m.created_at < ${snapshotDate})::int AS sales_before_t0,
        COUNT(m.id) FILTER (WHERE m.created_at >= ${snapshotDate})::int AS sales_at_or_after_t0
      FROM stock_movements m
      JOIN tn_orders o ON o.id = m.tn_order_id
      LEFT JOIN erp_orders e ON e.tn_order_id = o.id
      WHERE e.id IS NULL
        AND m.movement_type = 'sale'
        AND m.source = ${STOCK_LEDGER_SOURCE}
    `,
    prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count
      FROM tn_orders o
      LEFT JOIN erp_orders e ON e.tn_order_id = o.id
      WHERE e.id IS NULL
        AND EXISTS (
          SELECT 1
          FROM tn_order_item_units u
          WHERE u.tn_order_id = o.id
            AND u.is_stockable = true
            AND u.is_gifty = false
            AND COALESCE(TRIM(u.sku), '') <> ''
            AND COALESCE(TRIM(u.talle), '') <> ''
        )
        AND NOT EXISTS (
          SELECT 1 FROM stock_movements m
          WHERE m.tn_order_id = o.id
            AND m.movement_type = 'sale'
            AND m.source = ${STOCK_LEDGER_SOURCE}
        )
    `,
    prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count
      FROM tn_order_item_units u
      JOIN tn_orders o ON o.id = u.tn_order_id
      LEFT JOIN erp_orders e ON e.tn_order_id = o.id
      WHERE e.id IS NULL
        AND u.is_stockable = true
        AND u.is_gifty = false
        AND COALESCE(TRIM(u.sku), '') <> ''
        AND COALESCE(TRIM(u.talle), '') <> ''
        AND NOT EXISTS (
          SELECT 1 FROM stock_movements m
          WHERE m.tn_order_item_unit_id = u.id
            AND m.movement_type = 'sale'
            AND m.source = ${STOCK_LEDGER_SOURCE}
        )
    `,
  ]);

  return {
    snapshotDate: snapshotDate.toISOString(),
    tnOnlyOrders: orderCount[0]?.count ?? 0,
    stockableUnits: unitCount[0]?.count ?? 0,
    ordersWithSaleMovement: movementStats[0]?.orders_with_sale ?? 0,
    saleMovementsTotal: movementStats[0]?.sales_total ?? 0,
    saleMovementsBeforeT0: movementStats[0]?.sales_before_t0 ?? 0,
    saleMovementsAtOrAfterT0: movementStats[0]?.sales_at_or_after_t0 ?? 0,
    ordersPendingBackfill: pendingOrders[0]?.count ?? 0,
    unitsPendingBackfill: pendingUnits[0]?.count ?? 0,
  };
}

export async function bumpPreT0SaleMovements(snapshotDate: Date): Promise<number> {
  const prisma = getPrisma();
  const result = await prisma.stockMovement.updateMany({
    where: {
      source: STOCK_LEDGER_SOURCE,
      movementType: StockMovementType.sale,
      createdAt: { lt: snapshotDate },
    },
    data: { createdAt: snapshotDate },
  });
  return result.count;
}

export async function recordTnOrderStockSales(
  tnOrderId: string,
  opts?: {
    dryRun?: boolean;
    correlationId?: string;
    movementCreatedAt?: Date;
  }
): Promise<StockLedgerItemResult> {
  const prisma = getPrisma();
  const order = await prisma.tnOrder.findUnique({
    where: { id: tnOrderId },
    include: {
      itemUnits: { orderBy: [{ tnOrderItemId: "asc" }, { unitIndex: "asc" }] },
    },
  });

  if (!order) {
    return { ok: false, tnOrderId, error: "tn_order not found", code: "NOT_FOUND" };
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
    const unitMap = new Map(order.itemUnits.map((u) => [u.id, u]));

    await prisma.$transaction(async (tx) => {
      for (const d of drafts) {
        const unit = unitMap.get(d.tnOrderItemUnitId);
        if (!unit) continue;

        await tx.stockMovement.upsert({
          where: { idempotencyKey: d.idempotencyKey },
          create: {
            tnOrderId: order.id,
            tnOrderItemId: unit.tnOrderItemId,
            tnOrderItemUnitId: unit.id,
            sku: d.sku,
            talle: d.talle,
            owner: normalizeStockMovementGrain({
              sku: String(unit.sku ?? ""),
              talle: unit.talle,
              owner: unit.owner,
            }).owner,
            quantity: 1,
            movementType: StockMovementType.sale,
            direction: StockMovementDirection.out,
            reason: "tn_order_sale",
            idempotencyKey: d.idempotencyKey,
            correlationId: opts?.correlationId ?? null,
            source: STOCK_LEDGER_SOURCE,
            ...(opts?.movementCreatedAt
              ? { createdAt: opts.movementCreatedAt }
              : {}),
          },
          update: {
            sku: d.sku,
            talle: d.talle,
            owner: normalizeStockMovementGrain({
              sku: String(unit.sku ?? ""),
              talle: unit.talle,
              owner: unit.owner,
            }).owner,
            correlationId: opts?.correlationId ?? null,
            source: STOCK_LEDGER_SOURCE,
          },
        });
      }

      await tx.tnOrder.update({
        where: { id: tnOrderId },
        data: { stockDeductedAt: new Date() },
      });
    });
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

export async function recordTnOrdersStockSalesBatch(
  tnOrderIds: string[],
  opts?: {
    dryRun?: boolean;
    correlationId?: string;
    movementCreatedAt?: Date;
  }
): Promise<StockLedgerItemResult[]> {
  const results: StockLedgerItemResult[] = [];
  for (const id of tnOrderIds) {
    results.push(await recordTnOrderStockSales(id, opts));
  }
  return results;
}

export type StockValidationFailureSummary = {
  check: StockValidationFailure["check"];
  count: number;
  orders: string[];
};

export function summarizeStockValidationFailures(
  results: StockLedgerItemResult[]
): StockValidationFailureSummary[] {
  const map = new Map<
    StockValidationFailure["check"],
    { count: number; orders: Set<string> }
  >();

  for (const r of results) {
    if (!r.ok && r.validation) {
      for (const f of r.validation.failures) {
        if (f.check === "V-S8") continue;
        const cur = map.get(f.check) ?? { count: 0, orders: new Set() };
        cur.count += 1;
        cur.orders.add(r.tnOrderId);
        map.set(f.check, cur);
      }
    }
  }

  return [...map.entries()]
    .map(([check, v]) => ({
      check,
      count: v.count,
      orders: [...v.orders].sort(),
    }))
    .sort((a, b) => a.check.localeCompare(b.check));
}

export async function measureStockPilotCoverage(
  pilotOrderIds: string[]
): Promise<{
  pilotOrders: number;
  expectedSales: number;
  actualSales: number;
  orderCoveragePct: number;
  unitCoveragePct: number;
}> {
  const prisma = getPrisma();

  const [expectedRows, actualRows] = await Promise.all([
    prisma.$queryRaw<Array<{ sales: number }>>`
      SELECT COUNT(*)::int AS sales
      FROM tn_order_item_units u
      WHERE u.tn_order_id = ANY(${pilotOrderIds}::text[])
        AND u.is_stockable = true
        AND u.is_gifty = false
        AND COALESCE(TRIM(u.sku), '') <> ''
        AND COALESCE(TRIM(u.talle), '') <> ''
    `,
    prisma.$queryRaw<Array<{ orders: number; sales: number }>>`
      SELECT
        COUNT(DISTINCT m.tn_order_id)::int AS orders,
        COUNT(m.id)::int AS sales
      FROM stock_movements m
      WHERE m.tn_order_id = ANY(${pilotOrderIds}::text[])
        AND m.movement_type = 'sale'
        AND m.source = ${STOCK_LEDGER_SOURCE}
    `,
  ]);

  const expected = expectedRows[0]?.sales ?? 0;
  const actual = actualRows[0]?.sales ?? 0;
  const ordersWithSales = actualRows[0]?.orders ?? 0;

  return {
    pilotOrders: pilotOrderIds.length,
    expectedSales: expected,
    actualSales: actual,
    orderCoveragePct: pilotOrderIds.length
      ? Math.round((ordersWithSales / pilotOrderIds.length) * 10000) / 100
      : 0,
    unitCoveragePct: expected
      ? Math.round((actual / expected) * 10000) / 100
      : 0,
  };
}

export type TnOnlyStockCoverage = {
  tnOnlyOrders: number;
  expectedStockableUnits: number;
  saleMovementsTotal: number;
  saleMovementsPostT0: number;
  saleMovementsBeforeT0: number;
  ordersWithSales: number;
  unitCoveragePct: number;
  duplicateUnitSales: number;
  nonUnitQuantitySales: number;
  giftySales: number;
};

export async function measureTnOnlyStockCoverage(
  snapshotDate: Date
): Promise<TnOnlyStockCoverage> {
  const prisma = getPrisma();

  const [
    orderCount,
    expectedRows,
    movementRows,
    dupRows,
    qtyRows,
    giftyRows,
  ] = await Promise.all([
    prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count
      FROM tn_orders o
      LEFT JOIN erp_orders e ON e.tn_order_id = o.id
      WHERE e.id IS NULL
    `,
    prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count
      FROM tn_order_item_units u
      JOIN tn_orders o ON o.id = u.tn_order_id
      LEFT JOIN erp_orders e ON e.tn_order_id = o.id
      WHERE e.id IS NULL
        AND u.is_stockable = true
        AND u.is_gifty = false
        AND COALESCE(TRIM(u.sku), '') <> ''
        AND COALESCE(TRIM(u.talle), '') <> ''
    `,
    prisma.$queryRaw<
      Array<{
        total: number;
        post_t0: number;
        before_t0: number;
        orders: number;
      }>
    >`
      SELECT
        COUNT(m.id)::int AS total,
        COUNT(m.id) FILTER (WHERE m.created_at >= ${snapshotDate})::int AS post_t0,
        COUNT(m.id) FILTER (WHERE m.created_at < ${snapshotDate})::int AS before_t0,
        COUNT(DISTINCT m.tn_order_id)::int AS orders
      FROM stock_movements m
      JOIN tn_orders o ON o.id = m.tn_order_id
      LEFT JOIN erp_orders e ON e.tn_order_id = o.id
      WHERE e.id IS NULL
        AND m.movement_type = 'sale'
        AND m.source = ${STOCK_LEDGER_SOURCE}
    `,
    prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count
      FROM (
        SELECT m.tn_order_item_unit_id
        FROM stock_movements m
        JOIN tn_orders o ON o.id = m.tn_order_id
        LEFT JOIN erp_orders e ON e.tn_order_id = o.id
        WHERE e.id IS NULL
          AND m.movement_type = 'sale'
          AND m.source = ${STOCK_LEDGER_SOURCE}
          AND m.tn_order_item_unit_id IS NOT NULL
        GROUP BY m.tn_order_item_unit_id
        HAVING COUNT(*) > 1
      ) d
    `,
    prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count
      FROM stock_movements m
      JOIN tn_orders o ON o.id = m.tn_order_id
      LEFT JOIN erp_orders e ON e.tn_order_id = o.id
      WHERE e.id IS NULL
        AND m.movement_type = 'sale'
        AND m.source = ${STOCK_LEDGER_SOURCE}
        AND m.quantity <> 1
    `,
    prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count
      FROM stock_movements m
      JOIN tn_orders o ON o.id = m.tn_order_id
      LEFT JOIN erp_orders e ON e.tn_order_id = o.id
      WHERE e.id IS NULL
        AND m.movement_type = 'sale'
        AND m.source = ${STOCK_LEDGER_SOURCE}
        AND (
          UPPER(TRIM(m.sku)) = 'GIFTY'
          OR UPPER(TRIM(m.sku)) LIKE 'GIFTY-%'
        )
    `,
  ]);

  const expected = expectedRows[0]?.count ?? 0;
  const total = movementRows[0]?.total ?? 0;

  return {
    tnOnlyOrders: orderCount[0]?.count ?? 0,
    expectedStockableUnits: expected,
    saleMovementsTotal: total,
    saleMovementsPostT0: movementRows[0]?.post_t0 ?? 0,
    saleMovementsBeforeT0: movementRows[0]?.before_t0 ?? 0,
    ordersWithSales: movementRows[0]?.orders ?? 0,
    unitCoveragePct: expected
      ? Math.round((total / expected) * 10000) / 100
      : 0,
    duplicateUnitSales: dupRows[0]?.count ?? 0,
    nonUnitQuantitySales: qtyRows[0]?.count ?? 0,
    giftySales: giftyRows[0]?.count ?? 0,
  };
}

export async function loadActiveSnapshotDate(): Promise<Date> {
  const prisma = getPrisma();
  const run = await prisma.inventorySnapshotRun.findFirst({
    where: { isActive: true, source: "stock_maestro_bootstrap" },
    select: { snapshotDate: true },
    orderBy: { snapshotDate: "desc" },
  });
  if (!run) {
    throw new Error("active inventory snapshot T0 not found");
  }
  return run.snapshotDate;
}

export type StockMovementGrainAudit = {
  snapshotDate: string;
  postT0TnOnlySales: number;
  needsNormalization: number;
  alreadyNormalized: number;
  snapshotKeyMissAfterNormalize: number;
  samples: Array<{
    id: string;
    sku: string;
    talle: string | null;
    owner: string | null;
    nextSku: string;
    nextTalle: string;
    nextOwner: string;
  }>;
};

export async function auditPostT0StockMovementGrain(
  snapshotDate: Date
): Promise<StockMovementGrainAudit> {
  const prisma = getPrisma();

  const [snapshotRun, movements] = await Promise.all([
    prisma.inventorySnapshotRun.findFirst({
      where: { isActive: true, source: "stock_maestro_bootstrap" },
      select: { id: true },
    }),
    prisma.stockMovement.findMany({
      where: {
        source: STOCK_LEDGER_SOURCE,
        movementType: StockMovementType.sale,
        createdAt: { gte: snapshotDate },
        tnOrder: { erpOrder: null },
      },
      select: {
        id: true,
        sku: true,
        talle: true,
        owner: true,
      },
      orderBy: { id: "asc" },
    }),
  ]);

  if (!snapshotRun) throw new Error("active snapshot run missing");

  const snapshotLines = await prisma.inventorySnapshotLine.findMany({
    where: { runId: snapshotRun.id },
    select: { sku: true, talle: true, owner: true },
  });
  const snapshotKeys = new Set(
    snapshotLines.map((l) => projectionKey(l.sku, l.talle, l.owner))
  );

  let needsNormalization = 0;
  let alreadyNormalized = 0;
  let snapshotKeyMissAfterNormalize = 0;
  const samples: StockMovementGrainAudit["samples"] = [];

  for (const m of movements) {
    const next = normalizeStockMovementGrain({
      sku: m.sku,
      talle: m.talle,
      owner: m.owner,
    });
    const currentKey = projectionKey(m.sku, m.talle ?? "", m.owner ?? "8Q");
    const nextKey = projectionKey(next.sku, next.talle, next.owner);

    const needsUpdate =
      next.sku !== String(m.sku ?? "").trim().toUpperCase() ||
      next.talle !== String(m.talle ?? "").trim().toUpperCase() ||
      next.owner !== (String(m.owner ?? "8Q").trim() || "8Q");

    if (needsUpdate) {
      needsNormalization += 1;
      if (samples.length < 10) {
        samples.push({
          id: m.id,
          sku: m.sku,
          talle: m.talle,
          owner: m.owner,
          nextSku: next.sku,
          nextTalle: next.talle,
          nextOwner: next.owner,
        });
      }
    } else {
      alreadyNormalized += 1;
    }

    if (!snapshotKeys.has(nextKey) && nextKey !== currentKey) {
      snapshotKeyMissAfterNormalize += 1;
    }
  }

  return {
    snapshotDate: snapshotDate.toISOString(),
    postT0TnOnlySales: movements.length,
    needsNormalization,
    alreadyNormalized,
    snapshotKeyMissAfterNormalize,
    samples,
  };
}

export type NormalizePostT0StockMovementsResult = {
  dryRun: boolean;
  snapshotDate: string;
  scanned: number;
  updated: number;
  unchanged: number;
  auditAfter: StockMovementGrainAudit;
};

export async function normalizePostT0StockMovements(opts?: {
  dryRun?: boolean;
  snapshotDate?: Date;
}): Promise<NormalizePostT0StockMovementsResult> {
  const prisma = getPrisma();
  const snapshotDate = opts?.snapshotDate ?? (await loadActiveSnapshotDate());
  const dryRun = opts?.dryRun ?? false;

  const preAudit = await auditPostT0StockMovementGrain(snapshotDate);

  const movements = await prisma.stockMovement.findMany({
    where: {
      source: STOCK_LEDGER_SOURCE,
      movementType: StockMovementType.sale,
      createdAt: { gte: snapshotDate },
      tnOrder: { erpOrder: null },
    },
    select: { id: true, sku: true, talle: true, owner: true },
  });

  let updated = 0;
  let unchanged = 0;

  if (!dryRun) {
    for (const m of movements) {
      const next = normalizeStockMovementGrain({
        sku: m.sku,
        talle: m.talle,
        owner: m.owner,
      });

      const needsUpdate =
        next.sku !== String(m.sku ?? "").trim().toUpperCase() ||
        next.talle !== String(m.talle ?? "").trim().toUpperCase() ||
        next.owner !== (String(m.owner ?? "8Q").trim() || "8Q");

      if (!needsUpdate) {
        unchanged += 1;
        continue;
      }

      await prisma.stockMovement.update({
        where: { id: m.id },
        data: {
          sku: next.sku,
          talle: next.talle,
          owner: next.owner,
        },
      });
      updated += 1;
    }
  } else {
    updated = preAudit.needsNormalization;
    unchanged = preAudit.alreadyNormalized;
  }

  const auditAfter = dryRun
    ? {
        ...preAudit,
        needsNormalization: dryRun ? preAudit.needsNormalization : 0,
        alreadyNormalized: dryRun ? 0 : preAudit.postT0TnOnlySales,
      }
    : await auditPostT0StockMovementGrain(snapshotDate);

  return {
    dryRun,
    snapshotDate: snapshotDate.toISOString(),
    scanned: movements.length,
    updated,
    unchanged,
    auditAfter,
  };
}
