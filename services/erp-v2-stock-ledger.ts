import { getPrisma } from "@/lib/db/prisma";
import {
  classifyUnitParseWarnings,
  saleIdempotencyKey,
  summarizeParseWarningsAudit,
  unitIsSaleEligible,
  type ParseWarningsAuditReport,
  type UnitParseWarningInput,
} from "@/lib/erp/v2/classify-unit-parse-warnings";
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

  const drafts: StockSaleMovementDraft[] = eligible.map((u) => ({
    tnOrderItemUnitId: u.id,
    sku: String(u.sku ?? "").trim(),
    talle: u.talle,
    quantity: 1,
    movementType: StockMovementType.sale,
    idempotencyKey: saleIdempotencyKey(u.id),
  }));

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

export async function recordTnOrderStockSales(
  tnOrderId: string,
  opts?: { dryRun?: boolean; correlationId?: string }
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
            owner: unit.owner,
            quantity: 1,
            movementType: StockMovementType.sale,
            direction: StockMovementDirection.out,
            reason: "tn_order_sale",
            idempotencyKey: d.idempotencyKey,
            correlationId: opts?.correlationId ?? null,
            source: STOCK_LEDGER_SOURCE,
          },
          update: {
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
  opts?: { dryRun?: boolean; correlationId?: string }
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
