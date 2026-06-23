import { getPrisma } from "@/lib/db/prisma";
import { allocateTnOrderCommercial } from "@/lib/erp/v2/allocate-tn-order-commercial";
import { allocateTnOrderMp } from "@/lib/erp/v2/allocate-tn-order-mp";
import {
  validateTnMpAllocations,
  type MpValidationFailure,
  type MpValidationResult,
} from "@/lib/erp/v2/validate-tn-mp-allocations";
import { allocateTnOrderCommercialOnly } from "@/services/erp-v2-allocations-commercial";
import type { Prisma } from "@prisma/client";

export const MP_ALLOC_SOURCE = "m4_mp_allocation";

export type MpAllocateItemSuccess = {
  ok: true;
  tnOrderId: string;
  unitCount: number;
  mpPaymentId: string | null;
  validation: MpValidationResult;
};

export type MpAllocateItemFailure = {
  ok: false;
  tnOrderId: string;
  error: string;
  code: string;
  validation?: MpValidationResult;
};

export type MpAllocateItemResult = MpAllocateItemSuccess | MpAllocateItemFailure;

export type PaymentsAudit = {
  totalPayments: number;
  withTnOrderId: number;
  withMpNeto: number;
  mpApiSyncStaging: number;
  tnOnlyWithPayment: number;
  paymentWithUnits: number;
  paymentWithCommercialAlloc: number;
  paymentWithMpAlloc: number;
};

function toNum(v: Prisma.Decimal | number | string | null | undefined): number {
  if (v == null) return 0;
  return Number(v);
}

export async function auditPaymentsModel(): Promise<PaymentsAudit> {
  const prisma = getPrisma();
  const [base, tnOnly, eligible, mpAlloc] = await Promise.all([
    prisma.$queryRaw<
      Array<{
        total: number;
        with_tn: number;
        with_neto: number;
        mp_sync: number;
      }>
    >`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE tn_order_id IS NOT NULL)::int AS with_tn,
        COUNT(*) FILTER (WHERE mp_neto_real_orden IS NOT NULL)::int AS with_neto,
        COUNT(*) FILTER (WHERE source = 'mp_api_sync_staging')::int AS mp_sync
      FROM payments
    `,
    prisma.$queryRaw<Array<{ n: number }>>`
      SELECT COUNT(DISTINCT p.tn_order_id)::int AS n
      FROM payments p
      JOIN tn_orders o ON o.id = p.tn_order_id
      LEFT JOIN erp_orders e ON e.tn_order_id = o.id
      WHERE e.id IS NULL AND p.mp_neto_real_orden IS NOT NULL
    `,
    prisma.$queryRaw<
      Array<{
        with_units: number;
        with_commercial: number;
      }>
    >`
      SELECT
        COUNT(DISTINCT p.tn_order_id) FILTER (WHERE u.id IS NOT NULL)::int AS with_units,
        COUNT(DISTINCT p.tn_order_id) FILTER (WHERE a.id IS NOT NULL)::int AS with_commercial
      FROM payments p
      LEFT JOIN tn_order_item_units u ON u.tn_order_id = p.tn_order_id
      LEFT JOIN tn_order_item_allocations a ON a.tn_order_id = p.tn_order_id
      WHERE p.tn_order_id IS NOT NULL AND p.mp_neto_real_orden IS NOT NULL
    `,
    prisma.$queryRaw<Array<{ n: number }>>`
      SELECT COUNT(DISTINCT a.tn_order_id)::int AS n
      FROM tn_order_item_allocations a
      WHERE a.neto_prenda_real IS NOT NULL
    `,
  ]);

  const b = base[0] ?? { total: 0, with_tn: 0, with_neto: 0, mp_sync: 0 };
  const e = eligible[0] ?? { with_units: 0, with_commercial: 0 };

  return {
    totalPayments: b.total,
    withTnOrderId: b.with_tn,
    withMpNeto: b.with_neto,
    mpApiSyncStaging: b.mp_sync,
    tnOnlyWithPayment: tnOnly[0]?.n ?? 0,
    paymentWithUnits: e.with_units,
    paymentWithCommercialAlloc: e.with_commercial,
    paymentWithMpAlloc: mpAlloc[0]?.n ?? 0,
  };
}

export async function listMpEligibleOrderIds(): Promise<string[]> {
  const prisma = getPrisma();
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT DISTINCT p.tn_order_id AS id
    FROM payments p
    JOIN tn_order_item_units u ON u.tn_order_id = p.tn_order_id
    WHERE p.tn_order_id IS NOT NULL
      AND p.mp_neto_real_orden IS NOT NULL
      AND p.source = 'mp_api_sync_staging'
    ORDER BY p.tn_order_id ASC
  `;
  return rows.map((r) => String(r.id));
}

async function loadOrderWithUnitsAndPayment(tnOrderId: string) {
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
      itemUnits: {
        orderBy: [{ tnOrderItemId: "asc" }, { unitIndex: "asc" }],
      },
      allocations: {
        orderBy: [{ tnOrderItemId: "asc" }, { tnOrderItemUnitId: "asc" }],
      },
    },
  });
}

function rawPayload(
  value: Prisma.JsonValue | null
): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

type CommercialRow = {
  tnOrderItemUnitId: string;
  grossUnitAmount: number;
  netoPrenda: number;
  owner: string | null;
};

async function resolveCommercialRows(
  tnOrderId: string,
  order: NonNullable<Awaited<ReturnType<typeof loadOrderWithUnitsAndPayment>>>,
  ensureCommercial: boolean,
  dryRun: boolean
): Promise<{ ok: true; rows: CommercialRow[] } | MpAllocateItemFailure> {
  if (order.allocations.length) {
    return {
      ok: true,
      rows: order.allocations.map((a) => ({
        tnOrderItemUnitId: a.tnOrderItemUnitId,
        grossUnitAmount: toNum(a.grossUnitAmount),
        netoPrenda: toNum(a.netoPrenda),
        owner: a.owner,
      })),
    };
  }

  if (!ensureCommercial) {
    return {
      ok: false,
      tnOrderId,
      error: "sin commercial allocations — correr M4.2b primero",
      code: "NO_COMMERCIAL",
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

  if (!dryRun) {
    const commercial = await allocateTnOrderCommercialOnly(tnOrderId, {
      dryRun: false,
    });
    if (!commercial.ok) {
      return {
        ok: false,
        tnOrderId,
        error: "commercial prereq failed",
        code: "COMMERCIAL_FAILED",
      };
    }
    const refreshed = await loadOrderWithUnitsAndPayment(tnOrderId);
    if (!refreshed?.allocations.length) {
      return {
        ok: false,
        tnOrderId,
        error: "commercial alloc missing after write",
        code: "COMMERCIAL_MISSING",
      };
    }
    return {
      ok: true,
      rows: refreshed.allocations.map((a) => ({
        tnOrderItemUnitId: a.tnOrderItemUnitId,
        grossUnitAmount: toNum(a.grossUnitAmount),
        netoPrenda: toNum(a.netoPrenda),
        owner: a.owner,
      })),
    };
  }

  const { allocations } = allocateTnOrderCommercial(
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

  return {
    ok: true,
    rows: allocations.map((a) => ({
      tnOrderItemUnitId: a.tnOrderItemUnitId,
      grossUnitAmount: a.grossUnitAmount,
      netoPrenda: a.netoPrenda,
      owner: a.owner,
    })),
  };
}

async function persistMpAllocations(
  tnOrderId: string,
  mpRows: Awaited<ReturnType<typeof allocateTnOrderMp>>["allocations"]
): Promise<void> {
  const prisma = getPrisma();
  await prisma.$transaction(async (tx) => {
    for (const row of mpRows) {
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
    }
  });
}

export async function allocateTnOrderMpOnly(
  tnOrderId: string,
  opts?: { dryRun?: boolean; ensureCommercial?: boolean }
): Promise<MpAllocateItemResult> {
  const order = await loadOrderWithUnitsAndPayment(tnOrderId);

  if (!order) {
    return { ok: false, tnOrderId, error: "tn_order not found", code: "NOT_FOUND" };
  }

  const payment = order.payments[0];
  if (!payment?.mpNetoRealOrden) {
    return {
      ok: false,
      tnOrderId,
      error: "sin payment con mp_neto_real_orden",
      code: "NO_PAYMENT",
    };
  }

  const commercial = await resolveCommercialRows(
    tnOrderId,
    order,
    Boolean(opts?.ensureCommercial),
    Boolean(opts?.dryRun)
  );
  if (!commercial.ok) {
    return commercial;
  }

  const { allocations, pools } = allocateTnOrderMp(
    {
      mpNetoRealOrden: toNum(payment.mpNetoRealOrden),
      mpTaxTotalReal: toNum(payment.mpTaxTotalReal),
      mpFinancingTotalReal: toNum(payment.mpFinancingTotalReal),
      mpFeeTotalReal: toNum(payment.mpFeeTotalReal),
      mpPlatformFeeTotalReal: toNum(payment.mpPlatformFeeTotalReal),
      mpTotalCostReal: toNum(payment.mpTotalCostReal),
    },
    commercial.rows
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
    await persistMpAllocations(tnOrderId, allocations);
  }

  return {
    ok: true,
    tnOrderId,
    unitCount: allocations.length,
    mpPaymentId: payment.mpPaymentId,
    validation,
  };
}

export async function allocateTnOrdersMpBatch(
  tnOrderIds: string[],
  opts?: { dryRun?: boolean; ensureCommercial?: boolean }
): Promise<MpAllocateItemResult[]> {
  const results: MpAllocateItemResult[] = [];
  for (const id of tnOrderIds) {
    results.push(
      await allocateTnOrderMpOnly(id, {
        dryRun: opts?.dryRun,
        ensureCommercial: opts?.ensureCommercial,
      })
    );
  }
  return results;
}

export type MpValidationFailureSummary = {
  check: MpValidationFailure["check"];
  count: number;
  orders: string[];
};

export function summarizeMpValidationFailures(
  results: MpAllocateItemResult[]
): MpValidationFailureSummary[] {
  const map = new Map<
    MpValidationFailure["check"],
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

export async function allocateTnOrdersMpBackfill(
  tnOrderIds: string[],
  opts?: { dryRun?: boolean; ensureCommercial?: boolean }
): Promise<MpAllocateItemResult[]> {
  return allocateTnOrdersMpBatch(tnOrderIds, opts);
}

export type MpBatchValidationSummary = {
  ordersProcessed: number;
  ordersFailed: number;
  unitsProcessed: number;
  validationFailures: MpValidationFailureSummary[];
};

export function summarizeMpBatchResults(
  results: MpAllocateItemResult[]
): MpBatchValidationSummary {
  return {
    ordersProcessed: results.length,
    ordersFailed: results.filter((r) => !r.ok).length,
    unitsProcessed: results
      .filter((r) => r.ok)
      .reduce((a, r) => a + (r.ok ? r.unitCount : 0), 0),
    validationFailures: summarizeMpValidationFailures(results),
  };
}

export async function measureMpCoverage(): Promise<{
  eligibleOrders: number;
  mpAllocatedOrders: number;
  eligibleUnits: number;
  mpAllocatedUnits: number;
  orderCoveragePct: number;
  unitCoveragePct: number;
}> {
  const prisma = getPrisma();
  const [eligible, allocated] = await Promise.all([
    prisma.$queryRaw<
      Array<{ orders: number; units: number }>
    >`
      SELECT
        COUNT(DISTINCT p.tn_order_id)::int AS orders,
        COUNT(u.id)::int AS units
      FROM payments p
      JOIN tn_order_item_units u ON u.tn_order_id = p.tn_order_id
      WHERE p.mp_neto_real_orden IS NOT NULL
        AND p.source = 'mp_api_sync_staging'
    `,
    prisma.$queryRaw<
      Array<{ orders: number; units: number }>
    >`
      SELECT
        COUNT(DISTINCT a.tn_order_id)::int AS orders,
        COUNT(a.id)::int AS units
      FROM tn_order_item_allocations a
      JOIN payments p ON p.tn_order_id = a.tn_order_id
      WHERE a.neto_prenda_real IS NOT NULL
        AND p.mp_neto_real_orden IS NOT NULL
        AND p.source = 'mp_api_sync_staging'
    `,
  ]);

  const e = eligible[0] ?? { orders: 0, units: 0 };
  const a = allocated[0] ?? { orders: 0, units: 0 };

  return {
    eligibleOrders: e.orders,
    mpAllocatedOrders: a.orders,
    eligibleUnits: e.units,
    mpAllocatedUnits: a.units,
    orderCoveragePct: e.orders
      ? Math.round((a.orders / e.orders) * 10000) / 100
      : 0,
    unitCoveragePct: e.units
      ? Math.round((a.units / e.units) * 10000) / 100
      : 0,
  };
}
