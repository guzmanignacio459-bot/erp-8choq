import { artRangeBoundsMs } from "@/lib/erp/art-date";
import { getPrisma } from "@/lib/db/prisma";
import { mapTnRowToV2CommercialOrder } from "@/lib/erp/v2/map-v2-order";
import { matchesCommercialStatusFilter } from "@/lib/erp/v2/tn-commercial-status";
import type { V2CommercialOrder } from "@/types/erp-v2-api";
import type { Prisma } from "@prisma/client";

export type FetchV2OrdersParams = {
  from?: string;
  to?: string;
  q?: string;
  commercialStatus?: string;
  kpi?: boolean;
  page?: number;
  perPage?: number;
};

export type FetchV2OrdersResult =
  | {
      ok: true;
      data: V2CommercialOrder[];
      count: number;
      page: number;
      perPage: number;
      total: number;
      kpi?: {
        from: string;
        to: string;
        ordersInRange: number;
        facturacionTotal: number;
      };
    }
  | { ok: false; error: string };

function buildTnWhere(params: FetchV2OrdersParams): Prisma.TnOrderWhereInput {
  const where: Prisma.TnOrderWhereInput = {};

  if (params.kpi && params.from && params.to) {
    const bounds = artRangeBoundsMs(params.from, params.to);
    if (!bounds) {
      throw new Error("Invalid from/to date range (ART YYYY-MM-DD)");
    }
    where.tnAnalyticsCounted = true;
    where.tnCreatedAt = {
      gte: new Date(bounds.startMs),
      lte: new Date(bounds.endMs),
    };
  } else if (params.from || params.to) {
    const from = params.from ?? params.to!;
    const to = params.to ?? params.from!;
    const bounds = artRangeBoundsMs(from, to);
    if (!bounds) {
      throw new Error("Invalid from/to date range (ART YYYY-MM-DD)");
    }
    where.tnCreatedAt = {
      gte: new Date(bounds.startMs),
      lte: new Date(bounds.endMs),
    };
  }

  const q = (params.q ?? "").trim();
  if (q) {
    where.OR = [
      { id: { contains: q } },
      { erpOrder: { nombre: { contains: q, mode: "insensitive" } } },
      { erpOrder: { id: { contains: q, mode: "insensitive" } } },
    ];
  }

  return where;
}

export async function fetchV2Orders(
  params: FetchV2OrdersParams
): Promise<FetchV2OrdersResult> {
  try {
    const page = Math.max(1, params.page ?? 1);
    const perPage = Math.min(200, Math.max(1, params.perPage ?? 50));
    const prisma = getPrisma();
    const where = buildTnWhere(params);

    const rows = await prisma.tnOrder.findMany({
      where,
      include: { erpOrder: { include: { payments: true } } },
      orderBy: { tnCreatedAt: "desc" },
    });

    let mapped = rows.map(mapTnRowToV2CommercialOrder);

    if (params.commercialStatus) {
      mapped = mapped.filter((o) =>
        matchesCommercialStatusFilter(o.commercialStatus, params.commercialStatus)
      );
    }

    const total = mapped.length;
    const start = (page - 1) * perPage;
    const data = mapped.slice(start, start + perPage);

    let kpi:
      | {
          from: string;
          to: string;
          ordersInRange: number;
          facturacionTotal: number;
        }
      | undefined;
    if (params.kpi && params.from && params.to) {
      const kpiRows = mapped.filter((o) => o.tnAnalyticsCounted !== false);
      kpi = {
        from: params.from,
        to: params.to,
        ordersInRange: kpiRows.length,
        facturacionTotal: kpiRows.reduce((s, o) => s + o.tnTotal, 0),
      };
    }

    return {
      ok: true,
      data,
      count: data.length,
      page,
      perPage,
      total,
      kpi,
    };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: message };
  }
}

/** Conteo KPI comercial (misma lógica que l1:verify:db) */
export async function countV2CommercialKpi(
  from: string,
  to: string
): Promise<{ orders: number; facturacion: number }> {
  const result = await fetchV2Orders({
    from,
    to,
    kpi: true,
    page: 1,
    perPage: 1_000_000,
  });
  if (!result.ok) throw new Error(result.error);
  return {
    orders: result.kpi?.ordersInRange ?? result.total,
    facturacion: result.kpi?.facturacionTotal ?? 0,
  };
}
