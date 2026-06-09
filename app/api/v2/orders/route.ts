import { NextResponse } from "next/server";

import { checkErpV2DbRead } from "@/lib/db/assert-staging";
import { fetchV2Orders } from "@/services/erp-v2-orders";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
 * GET /api/v2/orders — espejo comercial TN-led (staging Neon)
 *
 * Query:
 * - from, to — YYYY-MM-DD ART (tn_created_at)
 * - kpi=1 — filtra tn_analytics_counted (default on si hay from+to)
 * - commercialStatus — activo|cancelado|reembolsado|pendiente
 * - q — búsqueda id/nombre/remito
 * - page, perPage — paginación (default 1, 50)
 */
export async function GET(req: Request) {
  const gate = checkErpV2DbRead();
  const fetchedAt = new Date().toISOString();

  if (!gate.ok) {
    return json(
      {
        ok: false,
        data: [],
        count: 0,
        page: 1,
        perPage: 50,
        total: 0,
        fetchedAt,
        source: "neon-staging",
        error: gate.message,
      },
      gate.status
    );
  }

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;
  const kpiParam = searchParams.get("kpi");
  const kpi =
    kpiParam === "1" || kpiParam === "true" || Boolean(from && to && kpiParam !== "0");

  const result = await fetchV2Orders({
    from,
    to,
    q: searchParams.get("q") ?? undefined,
    commercialStatus: searchParams.get("commercialStatus") ?? undefined,
    kpi,
    page: Number(searchParams.get("page") ?? "1"),
    perPage: Number(searchParams.get("perPage") ?? "50"),
  });

  if (!result.ok) {
    return json(
      {
        ok: false,
        data: [],
        count: 0,
        page: 1,
        perPage: 50,
        total: 0,
        fetchedAt,
        source: "neon-staging",
        urlMeta: gate.urlMeta,
        error: result.error,
      },
      500
    );
  }

  return json({
    ok: true,
    data: result.data,
    count: result.count,
    page: result.page,
    perPage: result.perPage,
    total: result.total,
    fetchedAt,
    source: "neon-staging",
    urlMeta: gate.urlMeta,
    kpi: result.kpi,
  });
}
