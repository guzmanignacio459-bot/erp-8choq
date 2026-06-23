/**
 * M5.2a — Expansión live de unidades post-T0 (sin allocations ni ledger)
 */

import { getPrisma } from "@/lib/db/prisma";
import {
  expandTnOrderItemToUnits,
  type TnOrderItemUnitDraft,
} from "@/lib/erp/v2/expand-tn-order-item-units";
import { buildTnOrderItemUnitKey } from "@/lib/erp/v2/tn-order-item-unit-key";
import { loadActiveSnapshotDate } from "@/services/erp-v2-stock-ledger";
import type { Prisma } from "@prisma/client";

export const M5_UNIT_EXPAND_SOURCE = "m5.2a_unit_expand";

function toUnitCreateInput(
  draft: TnOrderItemUnitDraft
): Prisma.TnOrderItemUnitCreateManyInput {
  return {
    tnOrderId: draft.tnOrderId,
    tnOrderItemId: draft.tnOrderItemId,
    unitIndex: draft.unitIndex,
    sku: draft.sku,
    talle: draft.talle,
    owner: draft.owner,
    unitPrice: draft.unitPrice,
    isGifty: draft.isGifty,
    isStockable: draft.isStockable,
    parseWarnings: draft.parseWarnings ?? undefined,
    source: draft.source,
  };
}

export type PendingExpansionLine = {
  id: string;
  tnOrderId: string;
  tnLineId: string | null;
  sku: string | null;
  quantity: number;
  unitPrice: unknown;
  existingUnits: number;
};

export type UnitExpansionLiveStats = {
  snapshotDate: string;
  postT0OrdersScanned: number;
  pendingLines: number;
  expectedNewUnits: number;
  unitsCreated: number;
  unitsSkippedExisting: number;
  ordersTouched: number;
  giftyUnits: number;
  nonStockableUnits: number;
  warningCount: number;
  qtyParityPass: boolean;
  expectedQtyTotal: number;
  actualUnitsTotal: number;
  allocationsWritten: false;
  stockMovementsWritten: false;
  snapshotTouched: false;
};

export type UnitExpansionLiveResult = {
  dryRun: boolean;
  stats: UnitExpansionLiveStats;
  samples: Array<{
    unitKey: string;
    tnOrderId: string;
    tnOrderItemId: string;
    unitIndex: number;
    sku: string | null;
    isGifty: boolean;
    isStockable: boolean;
  }>;
  errors: string[];
};

type ExistingIndexMap = Map<string, Set<number>>;

async function loadExistingUnitIndices(
  itemIds: string[]
): Promise<ExistingIndexMap> {
  const prisma = getPrisma();
  const map: ExistingIndexMap = new Map();
  if (!itemIds.length) return map;

  const rows = await prisma.tnOrderItemUnit.findMany({
    where: { tnOrderItemId: { in: itemIds } },
    select: { tnOrderItemId: true, unitIndex: true },
  });

  for (const row of rows) {
    let set = map.get(row.tnOrderItemId);
    if (!set) {
      set = new Set();
      map.set(row.tnOrderItemId, set);
    }
    set.add(row.unitIndex);
  }
  return map;
}

export async function listPostT0PendingExpansionLines(
  snapshotDate: Date
): Promise<PendingExpansionLine[]> {
  const prisma = getPrisma();
  return prisma.$queryRaw<PendingExpansionLine[]>`
    SELECT
      i.id,
      i.tn_order_id AS "tnOrderId",
      i.tn_line_id AS "tnLineId",
      i.sku,
      i.quantity,
      i.unit_price AS "unitPrice",
      COALESCE(u.cnt, 0)::int AS "existingUnits"
    FROM tn_order_items i
    JOIN tn_orders o ON o.id = i.tn_order_id
    LEFT JOIN (
      SELECT tn_order_item_id, COUNT(*)::int AS cnt
      FROM tn_order_item_units
      GROUP BY tn_order_item_id
    ) u ON u.tn_order_item_id = i.id
    WHERE (o.synced_at >= ${snapshotDate} OR o.tn_paid_at >= ${snapshotDate})
      AND COALESCE(u.cnt, 0) < i.quantity
    ORDER BY o.id, i.id
  `;
}

export async function countPostT0Orders(snapshotDate: Date): Promise<number> {
  const prisma = getPrisma();
  const rows = await prisma.$queryRaw<Array<{ count: number }>>`
    SELECT COUNT(DISTINCT o.id)::int AS count
    FROM tn_orders o
    WHERE o.synced_at >= ${snapshotDate} OR o.tn_paid_at >= ${snapshotDate}
  `;
  return rows[0]?.count ?? 0;
}

function buildMissingUnitDrafts(
  lines: PendingExpansionLine[],
  existing: ExistingIndexMap
): {
  drafts: TnOrderItemUnitDraft[];
  expectedNewUnits: number;
  unitsSkippedExisting: number;
  warnings: Array<{ tnOrderItemId: string; code: string }>;
} {
  let expectedNewUnits = 0;
  let unitsSkippedExisting = 0;
  const drafts: TnOrderItemUnitDraft[] = [];
  const warnings: Array<{ tnOrderItemId: string; code: string }> = [];

  for (const line of lines) {
    const expanded = expandTnOrderItemToUnits({
      id: line.id,
      tnOrderId: line.tnOrderId,
      sku: line.sku,
      quantity: line.quantity,
      unitPrice: line.unitPrice as number | string,
    });
    warnings.push(...expanded.warnings);

    const existingIdx = existing.get(line.id) ?? new Set<number>();
    unitsSkippedExisting += existingIdx.size;

    for (const unit of expanded.units) {
      if (existingIdx.has(unit.unitIndex)) continue;
      expectedNewUnits += 1;
      drafts.push({
        ...unit,
        source: M5_UNIT_EXPAND_SOURCE,
      });
    }
  }

  return { drafts, expectedNewUnits, unitsSkippedExisting, warnings };
}

export async function validatePostT0QtyParity(
  snapshotDate: Date,
  orderIds: string[]
): Promise<{
  pass: boolean;
  expectedQtyTotal: number;
  actualUnitsTotal: number;
}> {
  const prisma = getPrisma();
  if (!orderIds.length) {
    return { pass: true, expectedQtyTotal: 0, actualUnitsTotal: 0 };
  }

  const items = await prisma.tnOrderItem.findMany({
    where: { tnOrderId: { in: orderIds } },
    select: { quantity: true },
  });
  const expectedQtyTotal = items.reduce((s, i) => s + i.quantity, 0);
  const actualUnitsTotal = await prisma.tnOrderItemUnit.count({
    where: { tnOrderId: { in: orderIds } },
  });

  return {
    pass: expectedQtyTotal === actualUnitsTotal,
    expectedQtyTotal,
    actualUnitsTotal,
  };
}

export async function runPostT0UnitExpansionLive(opts?: {
  dryRun?: boolean;
  snapshotDate?: Date;
}): Promise<UnitExpansionLiveResult> {
  const dryRun = opts?.dryRun ?? true;
  const prisma = getPrisma();
  const errors: string[] = [];

  let snapshotDate: Date;
  try {
    snapshotDate = opts?.snapshotDate ?? (await loadActiveSnapshotDate());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(message);
    return {
      dryRun,
      stats: {
        snapshotDate: "",
        postT0OrdersScanned: 0,
        pendingLines: 0,
        expectedNewUnits: 0,
        unitsCreated: 0,
        unitsSkippedExisting: 0,
        ordersTouched: 0,
        giftyUnits: 0,
        nonStockableUnits: 0,
        warningCount: 0,
        qtyParityPass: false,
        expectedQtyTotal: 0,
        actualUnitsTotal: 0,
        allocationsWritten: false,
        stockMovementsWritten: false,
        snapshotTouched: false,
      },
      samples: [],
      errors,
    };
  }

  const [postT0OrdersScanned, pendingLines] = await Promise.all([
    countPostT0Orders(snapshotDate),
    listPostT0PendingExpansionLines(snapshotDate),
  ]);

  const itemIds = pendingLines.map((l) => l.id);
  const existing = await loadExistingUnitIndices(itemIds);
  const { drafts, expectedNewUnits, unitsSkippedExisting, warnings } =
    buildMissingUnitDrafts(pendingLines, existing);

  const orderIds = [...new Set(pendingLines.map((l) => l.tnOrderId))];
  let unitsCreated = 0;

  if (!dryRun && drafts.length) {
    const BATCH = 500;
    for (let i = 0; i < drafts.length; i += BATCH) {
      const batch = drafts.slice(i, i + BATCH);
      const res = await prisma.tnOrderItemUnit.createMany({
        data: batch.map(toUnitCreateInput),
        skipDuplicates: true,
      });
      unitsCreated += res.count;
    }
  }

  const postT0OrderIds = await prisma.tnOrder.findMany({
    where: {
      OR: [
        { syncedAt: { gte: snapshotDate } },
        { tnPaidAt: { gte: snapshotDate } },
      ],
    },
    select: { id: true },
  });
  const allPostT0Ids = postT0OrderIds.map((o) => o.id);
  const fullParity = await validatePostT0QtyParity(snapshotDate, allPostT0Ids);

  const stats: UnitExpansionLiveStats = {
    snapshotDate: snapshotDate.toISOString(),
    postT0OrdersScanned,
    pendingLines: pendingLines.length,
    expectedNewUnits,
    unitsCreated: dryRun ? 0 : unitsCreated,
    unitsSkippedExisting,
    ordersTouched: orderIds.length,
    giftyUnits: drafts.filter((d) => d.isGifty).length,
    nonStockableUnits: drafts.filter((d) => !d.isStockable).length,
    warningCount: warnings.length,
    qtyParityPass: fullParity.pass,
    expectedQtyTotal: fullParity.expectedQtyTotal,
    actualUnitsTotal: fullParity.actualUnitsTotal,
    allocationsWritten: false,
    stockMovementsWritten: false,
    snapshotTouched: false,
  };

  const samples = drafts.slice(0, 15).map((d) => ({
    unitKey: buildTnOrderItemUnitKey(d.tnOrderItemId, d.unitIndex),
    tnOrderId: d.tnOrderId,
    tnOrderItemId: d.tnOrderItemId,
    unitIndex: d.unitIndex,
    sku: d.sku,
    isGifty: d.isGifty,
    isStockable: d.isStockable,
  }));

  if (!dryRun && unitsCreated !== expectedNewUnits) {
    errors.push(
      `units created mismatch: expected ${expectedNewUnits}, got ${unitsCreated}`
    );
  }

  if (!fullParity.pass && !dryRun) {
    errors.push(
      `qty parity fail: expected ${fullParity.expectedQtyTotal}, actual ${fullParity.actualUnitsTotal}`
    );
  }

  return { dryRun, stats, samples, errors };
}

export function evaluateM52bRecommendation(input: {
  dryRun: boolean;
  errors: string[];
  stats: UnitExpansionLiveStats;
  idempotentSecondRun?: boolean;
}): "GO" | "NO_GO" | "GO_WITH_WARNINGS" {
  if (input.errors.length > 0) return "NO_GO";
  if (input.stats.snapshotTouched || input.stats.stockMovementsWritten) {
    return "NO_GO";
  }
  if (input.stats.allocationsWritten) return "NO_GO";
  if (!input.stats.qtyParityPass && !input.dryRun) return "NO_GO";
  if (input.idempotentSecondRun && input.stats.expectedNewUnits > 0) {
    return "NO_GO";
  }
  if (input.stats.warningCount > 0) return "GO_WITH_WARNINGS";
  return "GO";
}
