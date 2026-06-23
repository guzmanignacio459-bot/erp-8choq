import { artRangeBoundsMs } from "@/lib/erp/art-date";
import { getPrisma } from "@/lib/db/prisma";
import { mapErpRowToV2Remito } from "@/lib/erp/v2/map-v2-remito";
import type { V2RemitoOperational } from "@/types/erp-v2-api";
import type { Prisma } from "@prisma/client";

export type FetchV2RemitosParams = {
  from?: string;
  to?: string;
  q?: string;
};

export type FetchV2RemitosResult =
  | { ok: true; data: V2RemitoOperational[]; count: number }
  | { ok: false; error: string };

function buildErpWhere(params: FetchV2RemitosParams): Prisma.ErpOrderWhereInput {
  const where: Prisma.ErpOrderWhereInput = {};

  if (params.from || params.to) {
    const from = params.from ?? params.to!;
    const to = params.to ?? params.from!;
    const bounds = artRangeBoundsMs(from, to);
    if (!bounds) {
      throw new Error("Invalid from/to date range (ART YYYY-MM-DD)");
    }
    where.fechaErp = {
      gte: new Date(bounds.startMs),
      lte: new Date(bounds.endMs),
    };
  }

  const q = (params.q ?? "").trim();
  if (q) {
    where.OR = [
      { id: { contains: q, mode: "insensitive" } },
      { nombre: { contains: q, mode: "insensitive" } },
      { tnOrderId: { contains: q } },
      { dni: { contains: q } },
    ];
  }

  return where;
}

export async function fetchV2Remitos(
  params: FetchV2RemitosParams
): Promise<FetchV2RemitosResult> {
  try {
    const prisma = getPrisma();
    const rows = await prisma.erpOrder.findMany({
      where: buildErpWhere(params),
      include: { tnOrder: true },
      orderBy: { fechaErp: "desc" },
    });

    const data = rows.map(mapErpRowToV2Remito);
    return { ok: true, data, count: data.length };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: message };
  }
}
