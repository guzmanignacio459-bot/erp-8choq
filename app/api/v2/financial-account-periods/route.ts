import { NextResponse } from "next/server";

import { checkErpV2DbRead, checkFinancialAccountsWrite } from "@/lib/db/assert-staging";
import {
  createV2FinancialAccountPeriod,
  fetchV2FinancialAccountPeriods,
} from "@/services/erp-v2-financial-account-assignments";
import type { V2FinancialAccountPeriodCreateInput } from "@/types/erp-v2-financial-account-assignments";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/v2/financial-account-periods
 */
export async function GET() {
  const gate = checkErpV2DbRead();
  const fetchedAt = new Date().toISOString();

  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, data: [], fetchedAt, error: gate.message },
      { status: gate.status }
    );
  }

  const data = await fetchV2FinancialAccountPeriods();
  return NextResponse.json({ ok: true, data, fetchedAt, source: "neon-staging" });
}

/**
 * POST /api/v2/financial-account-periods
 */
export async function POST(req: Request) {
  const gate = checkFinancialAccountsWrite();
  const fetchedAt = new Date().toISOString();

  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, data: null, fetchedAt, error: gate.message },
      { status: gate.status }
    );
  }

  let body: V2FinancialAccountPeriodCreateInput;
  try {
    body = (await req.json()) as V2FinancialAccountPeriodCreateInput;
  } catch {
    return NextResponse.json(
      { ok: false, data: null, fetchedAt, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const result = await createV2FinancialAccountPeriod(body);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, data: null, fetchedAt, error: result.error },
      { status: 400 }
    );
  }

  return NextResponse.json(
    { ok: true, data: result.data, fetchedAt, source: "neon-staging" },
    { status: 201 }
  );
}
