import { NextResponse } from "next/server";

import { fetchErpRemitoDetail } from "@/services/erp-remito-detail";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = {
  params: Promise<{ id: string }>;
};

function json(body: Record<string, unknown>, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

/**
 * GET /api/erp/remitos/[id] — detalle read-only (GAS getRemito → getRemitoById).
 */
export async function GET(_req: Request, context: RouteContext) {
  const { id } = await context.params;
  const idRemito = decodeURIComponent(id ?? "").trim();

  if (!idRemito) {
    return json(
      {
        ok: false,
        data: null,
        fetchedAt: new Date().toISOString(),
        source: "apps-script",
        error: "ID Remito requerido",
      },
      400
    );
  }

  const result = await fetchErpRemitoDetail(idRemito);
  const fetchedAt = new Date().toISOString();

  if (!result.ok) {
    return json(
      {
        ok: false,
        data: null,
        fetchedAt,
        source: "apps-script",
        error: result.error,
        attemptedActions: result.attemptedActions,
      },
      result.notFound ? 404 : 502
    );
  }

  // TEMP debug — verificar MP post-mapper (quitar cuando GAS esté validado)
  console.log("[erp/remitos/detail] mapped MP", {
    idRemito,
    mpPaymentId: result.data.mpPaymentId ?? null,
    mpStatus: result.data.mpStatus ?? null,
    mpNetoRealOrden: result.data.mpNetoRealOrden ?? null,
    hasMp: Boolean(
      result.data.mpPaymentId?.trim() || result.data.mpStatus?.trim()
    ),
  });

  return json({
    ok: true,
    data: result.data,
    fetchedAt,
    source: "apps-script",
    gasActionUsed: result.gasActionUsed,
    attemptedActions: result.attemptedActions,
  });
}
