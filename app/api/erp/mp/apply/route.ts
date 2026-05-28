import { NextResponse } from "next/server";

import { applyMercadoPagoViaImportPayment } from "@/services/erp-mp-apply";
import type { ErpMpApplyRequestBody } from "@/types/erp";

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
 * POST /api/erp/mp/apply
 * Wrapper ERP → delega a POST /api/mercadopago/import-payment (sin tocarlo).
 */
export async function POST(req: Request) {
  let body: ErpMpApplyRequestBody;
  try {
    body = (await req.json()) as ErpMpApplyRequestBody;
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

  const tnOrderId = String(body?.tnOrderId ?? "").trim();
  const force = body?.force === true;

  if (!tnOrderId) {
    return json(
      {
        ok: false,
        fetchedAt: new Date().toISOString(),
        source: "erp-wrapper",
        error: "tnOrderId requerido",
      },
      400
    );
  }

  const result = await applyMercadoPagoViaImportPayment({
    req,
    tnOrderId,
    force,
  });

  const fetchedAt = new Date().toISOString();

  if (!result.ok) {
    const status =
      result.httpStatus && result.httpStatus >= 400 && result.httpStatus < 600
        ? result.httpStatus
        : result.error?.includes("Tokens")
          ? 500
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
