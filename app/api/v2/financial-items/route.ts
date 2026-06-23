import { NextResponse } from "next/server";

import { checkErpV2DbRead } from "@/lib/db/assert-staging";
import { fetchV2FinancialItems } from "@/services/erp-v2-financial-items";

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
 * GET /api/v2/financial-items — Financial Items TN (M6.1)
 *
 * Query: from, to (YYYY-MM-DD ART), sku, q, page, perPage
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
  const result = await fetchV2FinancialItems({
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
    sku: searchParams.get("sku") ?? undefined,
    q: searchParams.get("q") ?? undefined,
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
    kpi: result.kpi,
    fetchedAt,
    source: "neon-staging",
    urlMeta: gate.urlMeta,
  });
}
