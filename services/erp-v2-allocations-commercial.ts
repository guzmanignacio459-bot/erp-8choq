import { getPrisma } from "@/lib/db/prisma";
import {
  allocateTnOrderCommercial,
  type CommercialUnitAllocation,
} from "@/lib/erp/v2/allocate-tn-order-commercial";
import {
  validateTnCommercialAllocations,
  type CommercialValidationResult,
  type ValidationFailure,
} from "@/lib/erp/v2/validate-tn-commercial-allocations";
import type { Prisma } from "@prisma/client";

const COMMERCIAL_SOURCE = "m4_commercial_engine";
const MAX_BATCH = 50;

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
  const order = await prisma.tnOrder.findUnique({
    where: { id: tnOrderId },
    include: {
      itemUnits: {
        orderBy: [{ tnOrderItemId: "asc" }, { unitIndex: "asc" }],
      },
    },
  });
  return order;
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
    toNum(order.tnTotal)
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

  if (ids.length > MAX_BATCH) {
    throw new Error(`batch máximo ${MAX_BATCH} órdenes`);
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
