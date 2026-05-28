import { NextResponse } from "next/server";

import { fetchErpRemitosList } from "@/services/erp-remitos";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function json(
  body: Record<string, unknown>,
  status = 200
): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

/**
 * GET /api/erp/remitos — wrapper read-only para el dashboard ERP.
 *
 * Query params:
 * - q — filtro (pasa a GAS)
 * - debug=1 — incluye rawFirstRow / mappedFirstRow
 * - mode=auto|full|summary — fuerza acción GAS (default auto: full → fallback summary)
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";
  const debugMode = searchParams.get("debug") === "1";
  const mode = searchParams.get("mode");

  const result = await fetchErpRemitosList({ q, debug: debugMode, mode });

  const fetchedAt = new Date().toISOString();

  if (!result.ok) {
    const body: Record<string, unknown> = {
      ok: false,
      data: [],
      count: 0,
      fetchedAt,
      source: "apps-script",
      error: result.error,
    };
    if (debugMode && result.debug) {
      body.debug = result.debug;
    }
    return json(
      body,
      result.error.includes("configurada") ? 500 : 502
    );
  }

  const body: Record<string, unknown> = {
    ok: true,
    data: result.data,
    count: result.data.length,
    fetchedAt,
    source: "apps-script",
    listActionUsed: result.listActionUsed,
  };

  if (debugMode && result.debug) {
    body.debug = result.debug;
  }

  return json(body);
}
