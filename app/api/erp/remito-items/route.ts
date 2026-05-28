import { NextResponse } from "next/server";

import { fetchErpRemitoItems } from "@/services/erp-remito-items";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

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
 * GET /api/erp/remito-items — líneas REMITO_ITEMS read-only.
 *
 * Query: from, to, sku, owner (8Q | SCNL)
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;
  const sku = searchParams.get("sku") ?? undefined;
  const owner = searchParams.get("owner") ?? undefined;

  const result = await fetchErpRemitoItems({ from, to, sku, owner });
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
      result.error.includes("configurada") ? 500 : 502
    );
  }

  return json({
    ok: true,
    data: result.data,
    fetchedAt,
    source: "apps-script",
    gasActionUsed: result.gasActionUsed,
    attemptedActions: result.attemptedActions,
  });
}
