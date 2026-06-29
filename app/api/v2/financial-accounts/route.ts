import { NextResponse } from "next/server";

import { checkErpV2DbRead, checkFinancialAccountsWrite } from "@/lib/db/assert-staging";
import {
  fetchRecentAssignments,
  fetchTransferAssignmentKpi,
} from "@/services/erp-v2-financial-account-assignments";
import {
  createV2FinancialAccount,
  fetchV2FinancialAccounts,
} from "@/services/erp-v2-financial-accounts";
import type { V2FinancialAccountsDashboardResponse } from "@/types/erp-v2-financial-account-assignments";
import type {
  V2FinancialAccountCreateInput,
  V2FinancialAccountMutationResponse,
} from "@/types/erp-v2-financial-accounts";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function listJson(body: V2FinancialAccountsDashboardResponse, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function mutateJson(
  body: V2FinancialAccountMutationResponse,
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
 * GET /api/v2/financial-accounts — list + KPIs
 * Query: activeOnly=true
 */
export async function GET(req: Request) {
  const gate = checkErpV2DbRead();
  const fetchedAt = new Date().toISOString();

  if (!gate.ok) {
    return listJson(
      {
        ok: false,
        data: [],
        count: 0,
        kpi: null,
        assignments: null,
        recentAssignments: [],
        fetchedAt,
        source: "neon-staging",
        error: gate.message,
      },
      gate.status
    );
  }

  const { searchParams } = new URL(req.url);
  const activeOnly = searchParams.get("activeOnly") === "true";
  const [result, assignments, recentAssignments] = await Promise.all([
    fetchV2FinancialAccounts({ activeOnly }),
    fetchTransferAssignmentKpi(),
    fetchRecentAssignments(20),
  ]);

  if (!result.ok) {
    return listJson(
      {
        ok: false,
        data: [],
        count: 0,
        kpi: null,
        assignments: null,
        recentAssignments: [],
        fetchedAt,
        source: "neon-staging",
        error: result.error,
      },
      500
    );
  }

  return listJson({
    ok: true,
    data: result.data,
    count: result.count,
    kpi: result.kpi,
    assignments,
    recentAssignments,
    capabilities: { write: checkFinancialAccountsWrite().ok },
    fetchedAt,
    source: "neon-staging",
  });
}

/**
 * POST /api/v2/financial-accounts — create account
 */
export async function POST(req: Request) {
  const gate = checkFinancialAccountsWrite();
  const fetchedAt = new Date().toISOString();

  if (!gate.ok) {
    return mutateJson(
      {
        ok: false,
        data: null,
        fetchedAt,
        source: "neon-staging",
        error: gate.message,
      },
      gate.status
    );
  }

  let body: V2FinancialAccountCreateInput;
  try {
    body = (await req.json()) as V2FinancialAccountCreateInput;
  } catch {
    return mutateJson(
      {
        ok: false,
        data: null,
        fetchedAt,
        source: "neon-staging",
        error: "Invalid JSON body",
      },
      400
    );
  }

  const result = await createV2FinancialAccount(body);
  if (!result.ok) {
    return mutateJson(
      {
        ok: false,
        data: null,
        fetchedAt,
        source: "neon-staging",
        error: result.error,
      },
      400
    );
  }

  return mutateJson(
    {
      ok: true,
      data: result.data,
      fetchedAt,
      source: "neon-staging",
    },
    201
  );
}
