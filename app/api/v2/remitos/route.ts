import { NextResponse } from "next/server";

import { checkErpV2DbRead } from "@/lib/db/assert-staging";
import { fetchV2Remitos } from "@/services/erp-v2-remitos";

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
 * GET /api/v2/remitos — remitos operativos ERP-led (shadow B / staging Neon)
 *
 * Query:
 * - from, to — YYYY-MM-DD ART (fecha_erp)
 * - q — búsqueda id/nombre/tn_order_id/dni
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
        fetchedAt,
        source: "neon-staging",
        error: gate.message,
      },
      gate.status
    );
  }

  const { searchParams } = new URL(req.url);
  const result = await fetchV2Remitos({
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
    q: searchParams.get("q") ?? undefined,
  });

  if (!result.ok) {
    return json(
      {
        ok: false,
        data: [],
        count: 0,
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
    fetchedAt,
    source: "neon-staging",
    urlMeta: gate.urlMeta,
  });
}
