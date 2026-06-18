import { getPrisma } from "@/lib/db/prisma";
import {
  allocateTnOrderCommercial,
  type CommercialUnitAllocation,
} from "@/lib/erp/v2/allocate-tn-order-commercial";
import {
  validateTnCommercialAllocations,
  type BatchCoverageResult,
  type BatchValidationSummary,
  type CommercialValidationResult,
  type ValidationFailure,
} from "@/lib/erp/v2/validate-tn-commercial-allocations";
import type { Prisma } from "@prisma/client";

export const COMMERCIAL_SOURCE = "m4_commercial_allocation";
const API_MAX_BATCH = 50;

export type CommercialAllocateItemSuccess = {
  ok: true;
  tnOrderId: string;
  action: "created" | "updated";
  unitCount: number;
  validation: CommercialValidationResult;
};

export type CommercialAllocateItemFailure = {
  ok: false;
  tnOrderId: string;
  error: string;
  code: string;
  validation?: CommercialValidationResult;
};

export type CommercialAllocateItemResult =
  | CommercialAllocateItemSuccess
  | CommercialAllocateItemFailure;

export type CommercialAllocateBatchParams = {
  tnOrderIds: string[];
  dryRun?: boolean;
};

export type TnOnlyUniverseAudit = {
  orders: number;
  units: number;
  giftyUnits: number;
  nonStockableUnits: number;
  unitsWithParseWarnings: number;
  ordersWithParseWarnings: number;
  alreadyAllocatedOrders: number;
  alreadyAllocatedUnits: number;
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

async function persistCommercialAllocations(
  tnOrderId: string,
  allocations: CommercialUnitAllocation[]
): Promise<"created" | "updated"> {
  const prisma = getPrisma();
  const existing = await prisma.tnOrderItemAllocation.count({
    where: { tnOrderId },
  });

  await prisma.$transaction(async (tx) => {
    for (const row of allocations) {
      const data = {
        tnOrderId: row.tnOrderId,
        tnOrderItemId: row.tnOrderItemId,
        tnOrderItemUnitId: row.tnOrderItemUnitId,
        grossUnitAmount: row.grossUnitAmount,
        discountAllocated: row.discountAllocated,
        shippingAllocated: row.shippingAllocated,
        feeAllocated: row.feeAllocated,
        netoPrenda: row.netoPrenda,
        owner: row.owner,
        source: COMMERCIAL_SOURCE,
      };

      await tx.tnOrderItemAllocation.upsert({
        where: { tnOrderItemUnitId: row.tnOrderItemUnitId },
        create: data,
        update: data,
      });
    }

    await tx.tnOrder.update({
      where: { id: tnOrderId },
      data: { allocatedAt: new Date() },
    });
  });

  return existing > 0 ? "updated" : "created";
}

export async function listTnOnlyOrderIds(): Promise<string[]> {
  const prisma = getPrisma();
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT o.id
    FROM tn_orders o
    LEFT JOIN erp_orders e ON e.tn_order_id = o.id
    WHERE e.id IS NULL
      AND EXISTS (
        SELECT 1 FROM tn_order_item_units u WHERE u.tn_order_id = o.id
      )
    ORDER BY o.id ASC
  `;
  return rows.map((r) => String(r.id));
}

export async function auditTnOnlyUniverse(): Promise<TnOnlyUniverseAudit> {
  const prisma = getPrisma();
  const [base, gifty, warnings, allocated] = await Promise.all([
    prisma.$queryRaw<Array<{ orders: number; units: number }>>`
      SELECT
        COUNT(DISTINCT o.id)::int AS orders,
        COUNT(u.id)::int AS units
      FROM tn_orders o
      LEFT JOIN erp_orders e ON e.tn_order_id = o.id
      JOIN tn_order_item_units u ON u.tn_order_id = o.id
      WHERE e.id IS NULL
    `,
    prisma.$queryRaw<
      Array<{ gifty_units: number; non_stockable_units: number }>
    >`
      SELECT
        COUNT(*) FILTER (WHERE u.is_gifty)::int AS gifty_units,
        COUNT(*) FILTER (WHERE NOT u.is_stockable)::int AS non_stockable_units
      FROM tn_order_item_units u
      JOIN tn_orders o ON o.id = u.tn_order_id
      LEFT JOIN erp_orders e ON e.tn_order_id = o.id
      WHERE e.id IS NULL
    `,
    prisma.$queryRaw<
      Array<{ units_with_warnings: number; orders_with_warnings: number }>
    >`
      SELECT
        COUNT(*) FILTER (WHERE u.parse_warnings IS NOT NULL)::int AS units_with_warnings,
        COUNT(DISTINCT u.tn_order_id) FILTER (WHERE u.parse_warnings IS NOT NULL)::int AS orders_with_warnings
      FROM tn_order_item_units u
      JOIN tn_orders o ON o.id = u.tn_order_id
      LEFT JOIN erp_orders e ON e.tn_order_id = o.id
      WHERE e.id IS NULL
    `,
    prisma.$queryRaw<
      Array<{ allocated_orders: number; allocated_units: number }>
    >`
      SELECT
        COUNT(DISTINCT a.tn_order_id)::int AS allocated_orders,
        COUNT(a.id)::int AS allocated_units
      FROM tn_order_item_allocations a
      JOIN tn_orders o ON o.id = a.tn_order_id
      LEFT JOIN erp_orders e ON e.tn_order_id = o.id
      WHERE e.id IS NULL
    `,
  ]);

  const b = base[0] ?? { orders: 0, units: 0 };
  const g = gifty[0] ?? { gifty_units: 0, non_stockable_units: 0 };
  const w = warnings[0] ?? {
    units_with_warnings: 0,
    orders_with_warnings: 0,
  };
  const a = allocated[0] ?? { allocated_orders: 0, allocated_units: 0 };

  return {
    orders: b.orders,
    units: b.units,
    giftyUnits: g.gifty_units,
    nonStockableUnits: g.non_stockable_units,
    unitsWithParseWarnings: w.units_with_warnings,
    ordersWithParseWarnings: w.orders_with_warnings,
    alreadyAllocatedOrders: a.allocated_orders,
    alreadyAllocatedUnits: a.allocated_units,
  };
}

export async function measureTnOnlyCoverage(): Promise<BatchCoverageResult> {
  const prisma = getPrisma();
  const [universe, allocated, dupes, orphans] = await Promise.all([
    auditTnOnlyUniverse(),
    prisma.$queryRaw<
      Array<{ allocated_orders: number; allocated_units: number }>
    >`
      SELECT
        COUNT(DISTINCT a.tn_order_id)::int AS allocated_orders,
        COUNT(a.id)::int AS allocated_units
      FROM tn_order_item_allocations a
      JOIN tn_orders o ON o.id = a.tn_order_id
      LEFT JOIN erp_orders e ON e.tn_order_id = o.id
      WHERE e.id IS NULL
    `,
    prisma.$queryRaw<Array<{ n: number }>>`
      SELECT COUNT(*)::int AS n
      FROM (
        SELECT a.tn_order_item_unit_id
        FROM tn_order_item_allocations a
        JOIN tn_orders o ON o.id = a.tn_order_id
        LEFT JOIN erp_orders e ON e.tn_order_id = o.id
        WHERE e.id IS NULL
        GROUP BY a.tn_order_item_unit_id
        HAVING COUNT(*) > 1
      ) d
    `,
    prisma.$queryRaw<Array<{ n: number }>>`
      SELECT COUNT(*)::int AS n
      FROM tn_order_item_allocations a
      LEFT JOIN tn_order_item_units u ON u.id = a.tn_order_item_unit_id
      WHERE u.id IS NULL
    `,
  ]);

  const alloc = allocated[0] ?? { allocated_orders: 0, allocated_units: 0 };

  return {
    tnOnlyOrders: universe.orders,
    tnOnlyUnits: universe.units,
    allocatedOrders: alloc.allocated_orders,
    allocatedUnits: alloc.allocated_units,
    orderCoveragePct: universe.orders
      ? Math.round((alloc.allocated_orders / universe.orders) * 10000) / 100
      : 0,
    unitCoveragePct: universe.units
      ? Math.round((alloc.allocated_units / universe.units) * 10000) / 100
      : 0,
    duplicateUnitAllocations: dupes[0]?.n ?? 0,
    orphanAllocations: orphans[0]?.n ?? 0,
  };
}

export async function allocateTnOrderCommercialOnly(
  tnOrderId: string,
  opts?: { dryRun?: boolean }
): Promise<CommercialAllocateItemResult> {
  const order = await loadOrderWithUnits(tnOrderId);

  if (!order) {
    return {
      ok: false,
      tnOrderId,
      error: "tn_order not found",
      code: "NOT_FOUND",
    };
  }

  if (!order.itemUnits.length) {
    return {
      ok: false,
      tnOrderId,
      error: "sin tn_order_item_units — correr M4.1 expand primero",
      code: "NO_UNITS",
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
    const action = await persistCommercialAllocations(tnOrderId, allocations);
    return {
      ok: true,
      tnOrderId,
      action,
      unitCount: allocations.length,
      validation,
    };
  }

  return {
    ok: true,
    tnOrderId,
    action: "created",
    unitCount: allocations.length,
    validation,
  };
}

export async function allocateTnOrdersCommercialBatch(
  params: CommercialAllocateBatchParams
): Promise<CommercialAllocateItemResult[]> {
  const ids = [...new Set(params.tnOrderIds.map((id) => String(id).trim()))].filter(
    Boolean
  );

  if (ids.length > API_MAX_BATCH) {
    throw new Error(`batch API máximo ${API_MAX_BATCH} órdenes`);
  }

  const results: CommercialAllocateItemResult[] = [];
  for (const tnOrderId of ids) {
    results.push(
      await allocateTnOrderCommercialOnly(tnOrderId, {
        dryRun: params.dryRun,
      })
    );
  }
  return results;
}

export async function allocateTnOrdersCommercialBackfill(
  tnOrderIds: string[],
  opts?: { dryRun?: boolean }
): Promise<CommercialAllocateItemResult[]> {
  const ids = [...new Set(tnOrderIds.map((id) => String(id).trim()))].filter(
    Boolean
  );
  const results: CommercialAllocateItemResult[] = [];
  for (const tnOrderId of ids) {
    results.push(
      await allocateTnOrderCommercialOnly(tnOrderId, {
        dryRun: opts?.dryRun,
      })
    );
  }
  return results;
}

export type ValidationFailureSummary = {
  check: ValidationFailure["check"];
  count: number;
  orders: string[];
};

export function summarizeValidationFailures(
  results: CommercialAllocateItemResult[]
): ValidationFailureSummary[] {
  const map = new Map<
    ValidationFailure["check"],
    { count: number; orders: Set<string> }
  >();

  for (const r of results) {
    if (!r.ok && r.validation) {
      for (const f of r.validation.failures) {
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

export function summarizeBatchResults(
  results: CommercialAllocateItemResult[],
  coverage: BatchCoverageResult
): BatchValidationSummary {
  const validationFailures = summarizeValidationFailures(results);
  const ordersFailed = results.filter((r) => !r.ok).length;
  const unitsProcessed = results
    .filter((r) => r.ok)
    .reduce((a, r) => a + (r.ok ? r.unitCount : 0), 0);

  const auditOrders: BatchValidationSummary["auditV6"] = {
    ordersWithInferenceDelta: 0,
    maxInferenceDelta: 0,
    orders: [],
  };

  for (const r of results) {
    if (!r.ok || !("validation" in r)) continue;
    const { audit } = r.validation;
    const delta = Math.abs(audit.discountInferenceDelta);
    if (delta > 0.01) {
      auditOrders.ordersWithInferenceDelta += 1;
      auditOrders.maxInferenceDelta = Math.max(
        auditOrders.maxInferenceDelta,
        delta
      );
      auditOrders.orders.push({
        tnOrderId: r.tnOrderId,
        tnDiscount: audit.tnDiscount,
        poolDiscountInferred: audit.poolDiscountInferred,
        delta: audit.discountInferenceDelta,
      });
    }
  }

  auditOrders.orders.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return {
    ordersProcessed: results.length,
    ordersFailed,
    unitsProcessed,
    validationFailures,
    coverage,
    auditV6: auditOrders,
  };
}
