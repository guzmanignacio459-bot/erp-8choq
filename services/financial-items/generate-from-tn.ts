/**
 * M6.2 — Generator TN → Financial Items
 *
 * 1 tn_order_item_unit + allocation → 1 financial_item (idempotent upsert).
 * Copia mp/tn/shipping desde tn_order_item_allocations (prorrateo M5 por bruto).
 * netAmount = net_real (gross − discount − mp − tn − shipping).
 */

import type { Prisma } from "@prisma/client";

import { amountsFromAllocation } from "@/lib/financial-items/resolve-unit-amounts";
import { getPrisma } from "@/lib/db/prisma";
import type { GenerateFromTnResult } from "@/types/erp-v2-financial-items";

const GENERATOR_VERSION = "m6.2-tn-v1";
const ORIGIN_TYPE = "TN_ORDER" as const;

function buildUnitKey(unitId: string): string {
  return `tn:${unitId}`;
}

function resolveItemDate(order: {
  tnPaidAt: Date | null;
  tnCreatedAt: Date | null;
}): Date {
  return order.tnPaidAt ?? order.tnCreatedAt ?? new Date();
}

function resolveStatus(order: {
  commercialStatus: string | null;
  tnPaymentStatus: string | null;
}): string {
  return order.commercialStatus ?? order.tnPaymentStatus ?? "unknown";
}

export type GenerateFinancialItemsFromTnOptions = {
  tnOrderId?: string;
  batchSize?: number;
  dryRun?: boolean;
  cursor?: string | null;
  maxBatches?: number;
};

export async function generateFinancialItemsFromTn(
  options: GenerateFinancialItemsFromTnOptions = {}
): Promise<GenerateFromTnResult & { nextCursor: string | null }> {
  const prisma = getPrisma();
  const batchSize = Math.min(500, Math.max(50, options.batchSize ?? 200));
  const dryRun = options.dryRun ?? false;
  const maxBatches = options.maxBatches ?? Number.POSITIVE_INFINITY;

  let processed = 0;
  let created = 0;
  let updated = 0;
  let skippedNoAllocation = 0;
  let errors = 0;
  let cursor = options.cursor ?? null;
  let batches = 0;

  while (batches < maxBatches) {
    batches++;

    const units = await prisma.tnOrderItemUnit.findMany({
      where: options.tnOrderId ? { tnOrderId: options.tnOrderId } : undefined,
      take: batchSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      include: {
        allocation: true,
        tnOrderItem: true,
        tnOrder: true,
      },
    });

    if (units.length === 0) break;

    for (const unit of units) {
      processed++;

      if (!unit.allocation) {
        skippedNoAllocation++;
        continue;
      }

      const amounts = amountsFromAllocation(unit.allocation);
      const item = unit.tnOrderItem;
      const order = unit.tnOrder;
      const unitKey = buildUnitKey(unit.id);

      const payload = {
        originType: ORIGIN_TYPE,
        originId: unit.tnOrderId,
        originItemId: unit.tnOrderItemId,
        unitKey,
        date: resolveItemDate(order),
        customerName: order.customerName,
        sku: unit.sku ?? item.sku ?? "",
        productName: item.productName ?? "",
        variantName: unit.talle ?? item.variantName,
        quantity: 1,
        grossAmount: amounts.grossAmount,
        discountAllocated: amounts.discountAllocated,
        tnFeeAllocated: amounts.tnFeeAllocated,
        mpFeeAllocated: amounts.mpFeeAllocated,
        shippingAllocated: amounts.shippingAllocated,
        metaAdsAllocated: null as number | null,
        netAmount: amounts.netAmount,
        paymentMethod: order.paymentMethod,
        status: resolveStatus(order),
        sourceCreatedAt: order.tnCreatedAt,
        generatorVersion: GENERATOR_VERSION,
      };

      if (dryRun) continue;

      try {
        const existing = await prisma.financialItem.findUnique({
          where: {
            originType_unitKey: {
              originType: ORIGIN_TYPE,
              unitKey,
            },
          },
          select: { id: true },
        });

        await prisma.financialItem.upsert({
          where: {
            originType_unitKey: {
              originType: ORIGIN_TYPE,
              unitKey,
            },
          },
          create: payload,
          update: {
            ...payload,
            updatedAt: new Date(),
          },
        });

        if (existing) updated++;
        else created++;
      } catch {
        errors++;
      }
    }

    cursor = units[units.length - 1]!.id;
    if (units.length < batchSize) break;
  }

  return {
    processed,
    created,
    updated,
    skippedNoAllocation,
    errors,
    dryRun,
    nextCursor: cursor,
  };
}

/** Elimina financial_items TN sin allocation upstream (post M6.2 cleanup). */
export async function purgeOrphanTnFinancialItems(dryRun = false): Promise<number> {
  const prisma = getPrisma();
  if (dryRun) {
    const rows = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*)::bigint AS count
      FROM financial_items fi
      WHERE fi.origin_type = 'TN_ORDER'::"FinancialItemOriginType"
        AND NOT EXISTS (
          SELECT 1
          FROM tn_order_item_units u
          INNER JOIN tn_order_item_allocations a ON a.tn_order_item_unit_id = u.id
          WHERE fi.unit_key = 'tn:' || u.id
        )
    `;
    return Number(rows[0]?.count ?? 0);
  }

  const deleted = await prisma.$executeRaw`
    DELETE FROM financial_items fi
    WHERE fi.origin_type = 'TN_ORDER'::"FinancialItemOriginType"
      AND NOT EXISTS (
        SELECT 1
        FROM tn_order_item_units u
        INNER JOIN tn_order_item_allocations a ON a.tn_order_item_unit_id = u.id
        WHERE fi.unit_key = 'tn:' || u.id
      )
  `;
  return deleted;
}
