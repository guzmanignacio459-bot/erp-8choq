import { NextResponse } from "next/server";

import { checkErpV2DbRead } from "@/lib/db/assert-staging";
import { getPipelineSystemHealth } from "@/services/erp-v2-pipeline-health";
import type { PipelineSystemHealthResponse } from "@/types/erp-v2-pipeline-health";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function json(body: PipelineSystemHealthResponse, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

/**
 * GET /api/v2/system/pipeline-health — M5.5 dashboard + KPIs
 */
export async function GET() {
  const gate = checkErpV2DbRead();
  const fetchedAt = new Date().toISOString();

  if (!gate.ok) {
    return json(
      {
        ok: false,
        fetchedAt,
        latestRun: null,
        kpis24h: {
          windowHours: 24,
          totalRuns: 0,
          successRuns: 0,
          failedRuns: 0,
          successRate: 0,
          avgDurationMs: 0,
          maxDurationMs: 0,
          ordersImported: 0,
          warningsCount: 0,
        },
        recentRuns: [],
        healthCheck: null,
        pipelineStale: null,
        error: gate.message,
      },
      gate.status
    );
  }

  try {
    const data = await getPipelineSystemHealth();
    return json({
      ok: true,
      fetchedAt,
      ...data,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json(
      {
        ok: false,
        fetchedAt,
        latestRun: null,
        kpis24h: {
          windowHours: 24,
          totalRuns: 0,
          successRuns: 0,
          failedRuns: 0,
          successRate: 0,
          avgDurationMs: 0,
          maxDurationMs: 0,
          ordersImported: 0,
          warningsCount: 0,
        },
        recentRuns: [],
        healthCheck: null,
        pipelineStale: null,
        error: message,
      },
      500
    );
  }
}
