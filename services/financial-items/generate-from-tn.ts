/**
 * M6.1 — Generator TN → Financial Items
 *
 * 1 tn_order_item_unit + allocation → 1 financial_item (idempotent upsert).
 * No recalcula prorrateos — copia campos de tn_order_item_allocations.
 */

import type { Prisma } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import type { GenerateFromTnResult } from "@/types/erp-v2-financial-items";

const GENERATOR_VERSION = "m6.1-tn-v1";
const ORIGIN_TYPE = "TN_ORDER" as const;

function toNum(value: Prisma.Decimal | null | undefined): number {
  if (value == null) return 0;
  return Number(value);
}

function pickNetAmount(alloc: {
  netoPrendaReal: Prisma.Decimal | null;
  netoPrenda: Prisma.Decimal;
}): number {
  if (alloc.netoPrendaReal != null) return Number(alloc.netoPrendaReal);
  return Number(alloc.netoPrenda);
}

function pickMpFeeAllocated(alloc: {
  mpTotalCostAllocatedReal: Prisma.Decimal | null;
  mpFeeAllocatedReal: Prisma.Decimal | null;
  mpTaxAllocatedReal: Prisma.Decimal | null;
  mpFinancingAllocatedReal: Prisma.Decimal | null;
  mpPlatformFeeAllocatedReal: Prisma.Decimal | null;
}): number {
  if (alloc.mpTotalCostAllocatedReal != null) {
    return Number(alloc.mpTotalCostAllocatedReal);
  }
  return (
    toNum(alloc.mpFeeAllocatedReal) +
    toNum(alloc.mpTaxAllocatedReal) +
    toNum(alloc.mpFinancingAllocatedReal) +
    toNum(alloc.mpPlatformFeeAllocatedReal)
  );
}

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

      const alloc = unit.allocation;
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
        grossAmount: toNum(alloc.grossUnitAmount),
        discountAllocated: toNum(alloc.discountAllocated),
        tnFeeAllocated: toNum(alloc.feeAllocated),
        mpFeeAllocated: pickMpFeeAllocated(alloc),
        shippingAllocated: toNum(alloc.shippingAllocated),
        metaAdsAllocated: null as number | null,
        netAmount: pickNetAmount(alloc),
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
