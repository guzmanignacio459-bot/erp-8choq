import { NextResponse } from "next/server";

import { importOrdersViaErpWrapper } from "@/services/erp-orders-import";
import type { ErpOrdersImportRequestBody } from "@/types/erp";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

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
 * POST /api/erp/orders/import
 * Wrapper ERP → delega a POST /api/tiendanube/orders-paid/import-orders (sin tocarlo).
 */
export async function POST(req: Request) {
  let body: ErpOrdersImportRequestBody;
  try {
    body = (await req.json()) as ErpOrdersImportRequestBody;
  } catch {
    return json(
      {
        ok: false,
        fetchedAt: new Date().toISOString(),
        source: "erp-wrapper",
        error: "JSON inválido",
      },
      400
    );
  }

  const result = await importOrdersViaErpWrapper({ req, body });
  const fetchedAt = new Date().toISOString();

  if (!result.ok) {
    const status =
      result.httpStatus && result.httpStatus >= 400 && result.httpStatus < 600
        ? result.httpStatus
        : result.error?.includes("token") || result.error?.includes("Token")
          ? 500
          : result.error?.includes("inválid") ||
              result.error?.includes("requiere")
            ? 400
            : 502;

    return json(
      {
        ...result,
        fetchedAt,
        source: "erp-wrapper",
      },
      status
    );
  }

  return json({
    ...result,
    fetchedAt,
    source: "erp-wrapper",
  });
}
