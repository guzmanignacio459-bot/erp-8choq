import { NextResponse } from "next/server";

import { checkErpV2DbWrite } from "@/lib/db/assert-staging";
import {
  allocateTnOrdersMpBatch,
  summarizeMpValidationFailures,
} from "@/services/erp-v2-allocations-mp";
import type {
  V2MpAllocateRequest,
  V2MpAllocateResponse,
} from "@/types/erp-v2-api";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";
export const maxDuration = 300;

function json(body: V2MpAllocateResponse, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function summarize(results: V2MpAllocateResponse["results"]) {
  return {
    allocated: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    units: results
      .filter((r) => r.ok)
      .reduce((a, r) => a + (r.ok ? r.unitCount : 0), 0),
  };
}

/** POST /api/v2/allocations/mp — prorrateo MP TN-first (M4.2c, staging) */
export async function POST(req: Request) {
  const gate = checkErpV2DbWrite();
  const fetchedAt = new Date().toISOString();

  if (!gate.ok) {
    return json(
      {
        ok: false,
        results: [],
        count: 0,
        allocated: 0,
        failed: 0,
        units: 0,
        validationFailures: [],
        fetchedAt,
        source: "neon-staging",
        error: gate.message,
      },
      gate.status
    );
  }

  let body: V2MpAllocateRequest = {};
  try {
    body = (await req.json()) as V2MpAllocateRequest;
  } catch {
    return json(
      {
        ok: false,
        results: [],
        count: 0,
        allocated: 0,
        failed: 0,
        units: 0,
        validationFailures: [],
        fetchedAt,
        source: "neon-staging",
        urlMeta: gate.urlMeta,
        error: "invalid JSON body",
      },
      400
    );
  }

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
        allocated: 0,
        failed: 0,
        units: 0,
        validationFailures: [],
        fetchedAt,
        source: "neon-staging",
        urlMeta: gate.urlMeta,
        error: "tnOrderId or tnOrderIds required",
      },
      400
    );
  }

  try {
    const results = await allocateTnOrdersMpBatch(tnOrderIds, {
      dryRun: Boolean(body.dryRun),
      ensureCommercial: Boolean(body.ensureCommercial),
    });
    const stats = summarize(results);

    return json({
      ok: stats.failed === 0,
      results,
      count: results.length,
      ...stats,
      validationFailures: summarizeMpValidationFailures(results),
      fetchedAt,
      source: "neon-staging",
      urlMeta: gate.urlMeta,
      dryRun: body.dryRun,
      ensureCommercial: body.ensureCommercial,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json(
      {
        ok: false,
        results: [],
        count: 0,
        allocated: 0,
        failed: 1,
        units: 0,
        validationFailures: [],
        fetchedAt,
        source: "neon-staging",
        urlMeta: gate.urlMeta,
        error: message,
      },
      500
    );
  }
}
