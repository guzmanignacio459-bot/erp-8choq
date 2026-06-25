import { NextResponse } from "next/server";

import { checkErpV2DbWrite } from "@/lib/db/assert-staging";
import {
  deactivateV2FinancialAccount,
  updateV2FinancialAccount,
} from "@/services/erp-v2-financial-accounts";
import type {
  V2FinancialAccountMutationResponse,
  V2FinancialAccountUpdateInput,
} from "@/types/erp-v2-financial-accounts";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = { params: Promise<{ id: string }> };

function json(body: V2FinancialAccountMutationResponse, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

/**
 * PATCH /api/v2/financial-accounts/[id] — update account
 */
export async function PATCH(req: Request, ctx: RouteContext) {
  const gate = checkErpV2DbWrite();
  const fetchedAt = new Date().toISOString();
  const { id } = await ctx.params;

  if (!gate.ok) {
    return json(
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

  let body: V2FinancialAccountUpdateInput;
  try {
    body = (await req.json()) as V2FinancialAccountUpdateInput;
  } catch {
    return json(
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

  const result = await updateV2FinancialAccount(id, body);
  if (!result.ok) {
    return json(
      {
        ok: false,
        data: null,
        fetchedAt,
        source: "neon-staging",
        error: result.error,
      },
      result.error === "account not found" ? 404 : 400
    );
  }

  return json({
    ok: true,
    data: result.data,
    fetchedAt,
    source: "neon-staging",
  });
}

/**
 * DELETE /api/v2/financial-accounts/[id] — soft delete (is_active=false)
 */
export async function DELETE(_req: Request, ctx: RouteContext) {
  const gate = checkErpV2DbWrite();
  const fetchedAt = new Date().toISOString();
  const { id } = await ctx.params;

  if (!gate.ok) {
    return json(
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

  const result = await deactivateV2FinancialAccount(id);
  if (!result.ok) {
    return json(
      {
        ok: false,
        data: null,
        fetchedAt,
        source: "neon-staging",
        error: result.error,
      },
      result.error === "account not found" ? 404 : 400
    );
  }

  return json({
    ok: true,
    data: result.data,
    fetchedAt,
    source: "neon-staging",
  });
}
