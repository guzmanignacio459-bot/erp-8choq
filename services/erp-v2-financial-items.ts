import { artRangeBoundsMs } from "@/lib/erp/art-date";
import { getPrisma } from "@/lib/db/prisma";
import type {
  V2FinancialItemRow,
  V2FinancialItemsKpi,
} from "@/types/erp-v2-financial-items";
import type { FinancialItem, Prisma } from "@prisma/client";

export type FetchV2FinancialItemsParams = {
  from?: string;
  to?: string;
  sku?: string;
  q?: string;
  page?: number;
  perPage?: number;
};

export type FetchV2FinancialItemsResult =
  | {
      ok: true;
      data: V2FinancialItemRow[];
      count: number;
      page: number;
      perPage: number;
      total: number;
      kpi?: V2FinancialItemsKpi;
    }
  | { ok: false; error: string };

function mapRow(row: FinancialItem): V2FinancialItemRow {
  return {
    id: row.id,
    originType: row.originType as V2FinancialItemRow["originType"],
    originId: row.originId,
    originItemId: row.originItemId,
    unitKey: row.unitKey,
    date: row.date.toISOString(),
    customerName: row.customerName,
    sku: row.sku,
    productName: row.productName,
    variantName: row.variantName,
    quantity: row.quantity,
    grossAmount: Number(row.grossAmount),
    discountAllocated: Number(row.discountAllocated),
    tnFeeAllocated: Number(row.tnFeeAllocated),
    mpFeeAllocated: Number(row.mpFeeAllocated),
    shippingAllocated: Number(row.shippingAllocated),
    metaAdsAllocated:
      row.metaAdsAllocated != null ? Number(row.metaAdsAllocated) : null,
    netAmount: Number(row.netAmount),
    paymentMethod: row.paymentMethod,
    status: row.status,
    sourceCreatedAt: row.sourceCreatedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function buildWhere(params: FetchV2FinancialItemsParams): Prisma.FinancialItemWhereInput {
  const where: Prisma.FinancialItemWhereInput = {
    originType: "TN_ORDER",
  };

  if (params.from || params.to) {
    const from = params.from ?? params.to!;
    const to = params.to ?? params.from!;
    const bounds = artRangeBoundsMs(from, to);
    if (!bounds) {
      throw new Error("Invalid from/to date range (ART YYYY-MM-DD)");
    }
    where.date = {
      gte: new Date(bounds.startMs),
      lte: new Date(bounds.endMs),
    };
  }

  const sku = (params.sku ?? "").trim();
  if (sku) {
    where.sku = { contains: sku, mode: "insensitive" };
  }

  const q = (params.q ?? "").trim();
  if (q) {
    where.OR = [
      { sku: { contains: q, mode: "insensitive" } },
      { productName: { contains: q, mode: "insensitive" } },
      { customerName: { contains: q, mode: "insensitive" } },
      { originId: { contains: q } },
    ];
  }

  return where;
}

export async function fetchV2FinancialItems(
  params: FetchV2FinancialItemsParams
): Promise<FetchV2FinancialItemsResult> {
  try {
    const prisma = getPrisma();
    const page = Math.max(1, params.page ?? 1);
    const perPage = Math.min(200, Math.max(1, params.perPage ?? 50));
    const where = buildWhere(params);
    const skip = (page - 1) * perPage;

    const [total, rows, agg] = await Promise.all([
      prisma.financialItem.count({ where }),
      prisma.financialItem.findMany({
        where,
        orderBy: [{ date: "desc" }, { id: "desc" }],
        skip,
        take: perPage,
      }),
      prisma.financialItem.aggregate({
        where,
        _sum: {
          grossAmount: true,
          discountAllocated: true,
          tnFeeAllocated: true,
          mpFeeAllocated: true,
          shippingAllocated: true,
          netAmount: true,
        },
        _count: { id: true },
      }),
    ]);

    const kpi: V2FinancialItemsKpi = {
      itemCount: agg._count.id,
      grossTotal: Number(agg._sum.grossAmount ?? 0),
      discountTotal: Number(agg._sum.discountAllocated ?? 0),
      tnFeeTotal: Number(agg._sum.tnFeeAllocated ?? 0),
      mpFeeTotal: Number(agg._sum.mpFeeAllocated ?? 0),
      shippingTotal: Number(agg._sum.shippingAllocated ?? 0),
      netTotal: Number(agg._sum.netAmount ?? 0),
    };

    return {
      ok: true,
      data: rows.map(mapRow),
      count: rows.length,
      page,
      perPage,
      total,
      kpi,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
