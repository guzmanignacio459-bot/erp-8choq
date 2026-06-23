import { NextResponse } from "next/server";

import { checkErpV2DbWrite } from "@/lib/db/assert-staging";
import { syncTnPaymentFromMp, syncTnPaymentsBatch } from "@/services/erp-v2-payments-sync";
import type {
  V2PaymentSyncItemResult,
  V2PaymentSyncRequest,
  V2PaymentSyncResponse,
} from "@/types/erp-v2-api";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";
export const maxDuration = 300;

function json(body: V2PaymentSyncResponse, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function summarize(results: V2PaymentSyncItemResult[]) {
  return {
    synced: results.filter((r) => r.ok && r.action !== "skipped").length,
    skipped: results.filter((r) => r.ok && r.action === "skipped").length,
    failed: results.filter((r) => !r.ok).length,
  };
}

/**
 * POST /api/v2/payments/sync — MP API → Neon payments (TN-first, staging)
 *
 * Body:
 * - tnOrderId | tnOrderIds[] — órdenes TN a sincronizar (máx. 50)
 * - paymentId? — fetch directo MP (con tnOrderId)
 * - force? — re-fetch aunque ya sincronizado
 *
 * Gates: ERP_V2_DB_WRITE=true + DATABASE_URL Neon staging
 */
export async function POST(req: Request) {
  const gate = checkErpV2DbWrite();
  const fetchedAt = new Date().toISOString();

  if (!gate.ok) {
    return json(
      {
        ok: false,
        results: [],
        count: 0,
        synced: 0,
        skipped: 0,
        failed: 0,
        fetchedAt,
        source: "neon-staging",
        error: gate.message,
      },
      gate.status
    );
  }

  let body: V2PaymentSyncRequest = {};
  try {
    body = (await req.json()) as V2PaymentSyncRequest;
  } catch {
    return json(
      {
        ok: false,
        results: [],
        count: 0,
        synced: 0,
        skipped: 0,
        failed: 0,
        fetchedAt,
        source: "neon-staging",
        urlMeta: gate.urlMeta,
        error: "invalid JSON body",
      },
      400
    );
  }

  const force = Boolean(body.force);
  const singleId = body.tnOrderId ? String(body.tnOrderId).trim() : "";
  const batchIds = Array.isArray(body.tnOrderIds)
    ? body.tnOrderIds.map((id) => String(id).trim()).filter(Boolean)
    : [];

  const tnOrderIds = singleId
    ? [singleId, ...batchIds.filter((id) => id !== singleId)]
    : batchIds;

  if (!tnOrderIds.length) {
    return json(
      {
        ok: false,
        results: [],
        count: 0,
        synced: 0,
        skipped: 0,
        failed: 0,
        fetchedAt,
        source: "neon-staging",
        urlMeta: gate.urlMeta,
        error: "tnOrderId or tnOrderIds required",
      },
      400
    );
  }

  try {
    let results: V2PaymentSyncItemResult[];

    if (tnOrderIds.length === 1 && body.paymentId != null) {
      const one = await syncTnPaymentFromMp({
        tnOrderId: tnOrderIds[0]!,
        paymentId: body.paymentId,
        force,
      });
      results = [one];
    } else {
      results = await syncTnPaymentsBatch({ tnOrderIds, force });
    }

    const stats = summarize(results);

    return json({
      ok: stats.failed === 0,
      results,
      count: results.length,
      ...stats,
      fetchedAt,
      source: "neon-staging",
      urlMeta: gate.urlMeta,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json(
      {
        ok: false,
        results: [],
        count: 0,
        synced: 0,
        skipped: 0,
        failed: 1,
        fetchedAt,
        source: "neon-staging",
        urlMeta: gate.urlMeta,
        error: message,
      },
      500
    );
  }
}
