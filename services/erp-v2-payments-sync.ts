import { getPrisma } from "@/lib/db/prisma";
import { denormTnMpHeaders } from "@/lib/erp/v2/denorm-tn-mp-headers";
import {
  diffNormalizedMpPayment,
  normalizeMpPayment,
  type NormalizedMpPayment,
} from "@/lib/erp/v2/normalize-mp-payment";
import {
  fetchMpPaymentById,
  inferTnOrderIdFromMp,
  searchMpPaymentIdByTnOrderId,
} from "@/lib/erp/v2/mp-payment-search";
import type { Payment } from "@prisma/client";
import type { Prisma } from "@prisma/client";

const MP_SYNC_SOURCE = "mp_api_sync_staging";
const MAX_BATCH = 50;

export type SyncTnPaymentParams = {
  tnOrderId: string;
  paymentId?: number | string;
  force?: boolean;
};

export type SyncTnPaymentSuccess = {
  ok: true;
  tnOrderId: string;
  mpPaymentId: string;
  action: "created" | "updated" | "skipped";
  matchRule: string;
  changedFields: string[];
  source: string;
};

export type SyncTnPaymentFailure = {
  ok: false;
  tnOrderId: string;
  error: string;
  code: string;
};

export type SyncTnPaymentResult = SyncTnPaymentSuccess | SyncTnPaymentFailure;

function paymentToPartialNormalized(
  payment: Payment | null
): Partial<NormalizedMpPayment> | null {
  if (!payment) return null;
  return {
    mpPaymentId: payment.mpPaymentId ?? "",
    mpStatus: payment.mpStatus,
    mpStatusDetail: payment.mpStatusDetail,
    mpDateCreated: payment.mpDateCreated,
    mpDateApproved: payment.mpDateApproved,
    mpTransactionAmount: payment.mpTransactionAmount
      ? Number(payment.mpTransactionAmount)
      : null,
    mpNetReceivedAmount: payment.mpNetReceivedAmount
      ? Number(payment.mpNetReceivedAmount)
      : null,
    mpNetoRealOrden: payment.mpNetoRealOrden
      ? Number(payment.mpNetoRealOrden)
      : null,
    mpTaxTotalReal: payment.mpTaxTotalReal
      ? Number(payment.mpTaxTotalReal)
      : null,
    mpFinancingTotalReal: payment.mpFinancingTotalReal
      ? Number(payment.mpFinancingTotalReal)
      : null,
    mpFeeTotalReal: payment.mpFeeTotalReal
      ? Number(payment.mpFeeTotalReal)
      : null,
    mpPlatformFeeTotalReal: payment.mpPlatformFeeTotalReal
      ? Number(payment.mpPlatformFeeTotalReal)
      : null,
    mpTotalCostReal: payment.mpTotalCostReal
      ? Number(payment.mpTotalCostReal)
      : null,
  };
}

function needsMpApiRefresh(existing: Payment | null, force: boolean): boolean {
  if (force) return true;
  if (!existing) return true;
  if (!existing.mpDateApproved || !existing.mpImportedAt) return true;
  if (existing.source !== MP_SYNC_SOURCE) return true;
  return false;
}

function buildPaymentData(
  normalized: NormalizedMpPayment,
  tnOrderId: string,
  erpOrderId: string | null,
  matchRule: string,
  matchConfidence: number,
  now: Date
): Prisma.PaymentUncheckedCreateInput {
  return {
    tnOrderId,
    erpOrderId,
    mpPaymentId: normalized.mpPaymentId,
    mpAdditionalReference: normalized.mpAdditionalReference,
    mpMatchRule: matchRule,
    mpMatchConfidence: String(matchConfidence),
    mpMatchedAt: now,
    mpImportedAt: now,
    mpStatus: normalized.mpStatus,
    mpStatusDetail: normalized.mpStatusDetail,
    mpDateCreated: normalized.mpDateCreated,
    mpDateApproved: normalized.mpDateApproved,
    mpMoneyReleaseDate: normalized.mpMoneyReleaseDate,
    mpAcreditadoFecha: normalized.mpAcreditadoFecha,
    mpTransactionAmount: normalized.mpTransactionAmount,
    mpNetReceivedAmount: normalized.mpNetReceivedAmount,
    mpNetoRealOrden: normalized.mpNetoRealOrden,
    mpTaxTotalReal: normalized.mpTaxTotalReal,
    mpFinancingTotalReal: normalized.mpFinancingTotalReal,
    mpFeeTotalReal: normalized.mpFeeTotalReal,
    mpPlatformFeeTotalReal: normalized.mpPlatformFeeTotalReal,
    mpTotalCostReal: normalized.mpTotalCostReal,
    mpPayerEmail: normalized.mpPayerEmail,
    mpPaymentType: normalized.mpPaymentType,
    mpPaymentMethod: normalized.mpPaymentMethod,
    mpInstallments: normalized.mpInstallments,
    source: MP_SYNC_SOURCE,
  };
}

export async function syncTnPaymentFromMp(
  params: SyncTnPaymentParams
): Promise<SyncTnPaymentResult> {
  const tnOrderId = String(params.tnOrderId ?? "").trim();
  if (!tnOrderId) {
    return {
      ok: false,
      tnOrderId: "",
      error: "tnOrderId required",
      code: "tn_order_id_required",
    };
  }

  const prisma = getPrisma();
  const force = Boolean(params.force);
  const now = new Date();

  const tn = await prisma.tnOrder.findUnique({
    where: { id: tnOrderId },
    include: { erpOrder: { select: { id: true } } },
  });

  if (!tn) {
    return {
      ok: false,
      tnOrderId,
      error: `tn_order not found: ${tnOrderId}`,
      code: "tn_order_not_found",
    };
  }

  const erpOrderId = tn.erpOrder?.id ?? null;

  let existing = await prisma.payment.findFirst({
    where: { tnOrderId },
    orderBy: { updatedAt: "desc" },
  });

  if (!existing && tn.mpPaymentId) {
    existing = await prisma.payment.findUnique({
      where: { mpPaymentId: tn.mpPaymentId },
    });
  }

  if (!needsMpApiRefresh(existing, force)) {
    return {
      ok: true,
      tnOrderId,
      mpPaymentId: existing!.mpPaymentId!,
      action: "skipped",
      matchRule: existing!.mpMatchRule ?? "already_synced",
      changedFields: [],
      source: existing!.source,
    };
  }

  let resolvedPaymentId: number | null = null;
  let matchRule = "provided_payment_id";
  let matchConfidence = 1;

  if (params.paymentId != null && String(params.paymentId).trim() !== "") {
    const pid = Number(params.paymentId);
    if (!pid || Number.isNaN(pid)) {
      return {
        ok: false,
        tnOrderId,
        error: "invalid paymentId",
        code: "invalid_payment_id",
      };
    }
    resolvedPaymentId = pid;
  } else if (existing?.mpPaymentId) {
    const pid = Number(existing.mpPaymentId);
    if (pid && !Number.isNaN(pid)) {
      resolvedPaymentId = pid;
      matchRule = "existing_mp_payment_id";
      matchConfidence = 0.95;
    }
  } else if (tn.mpPaymentId) {
    const pid = Number(tn.mpPaymentId);
    if (pid && !Number.isNaN(pid)) {
      resolvedPaymentId = pid;
      matchRule = "tn_header_mp_payment_id";
      matchConfidence = 0.9;
    }
  }

  if (!resolvedPaymentId) {
    const search = await searchMpPaymentIdByTnOrderId(tnOrderId);
    if (!search.ok) {
      return {
        ok: false,
        tnOrderId,
        error: `MP search failed (${search.status})`,
        code: "mp_search_failed",
      };
    }
    if (!search.paymentId) {
      return {
        ok: false,
        tnOrderId,
        error: "no MP payment found for tn_order_id",
        code: "mp_payment_not_found",
      };
    }
    resolvedPaymentId = search.paymentId;
    matchRule = search.pickedRule;
    matchConfidence = 0.85;
  }

  const fetch = await fetchMpPaymentById(resolvedPaymentId);
  if (!fetch.ok) {
    return {
      ok: false,
      tnOrderId,
      error: `MP fetch failed (${fetch.status})`,
      code: "mp_fetch_failed",
    };
  }

  const inferred = inferTnOrderIdFromMp(fetch.data);
  if (inferred.tnOrderId && inferred.tnOrderId !== tnOrderId) {
    return {
      ok: false,
      tnOrderId,
      error: `MP payment external_reference mismatch: expected ${tnOrderId}, got ${inferred.tnOrderId}`,
      code: "mp_tn_mismatch",
    };
  }

  const normalized = normalizeMpPayment(fetch.data, resolvedPaymentId);
  const changedFields = diffNormalizedMpPayment(
    paymentToPartialNormalized(existing),
    normalized
  );

  const data = buildPaymentData(
    normalized,
    tnOrderId,
    erpOrderId,
    matchRule,
    matchConfidence,
    now
  );

  let action: "created" | "updated";

  if (existing?.id) {
    await prisma.payment.update({
      where: { id: existing.id },
      data,
    });
    action = "updated";
  } else {
    const byMp = await prisma.payment.findUnique({
      where: { mpPaymentId: normalized.mpPaymentId },
    });
    if (byMp) {
      await prisma.payment.update({
        where: { id: byMp.id },
        data,
      });
      action = "updated";
    } else {
      await prisma.payment.create({ data });
      action = "created";
    }
  }

  await denormTnMpHeaders([tnOrderId]);

  return {
    ok: true,
    tnOrderId,
    mpPaymentId: normalized.mpPaymentId,
    action,
    matchRule,
    changedFields,
    source: MP_SYNC_SOURCE,
  };
}

export async function syncTnPaymentsBatch(params: {
  tnOrderIds: string[];
  force?: boolean;
}): Promise<SyncTnPaymentResult[]> {
  const ids = [...new Set(params.tnOrderIds.map((id) => String(id).trim()).filter(Boolean))];
  if (ids.length > MAX_BATCH) {
    return [
      {
        ok: false,
        tnOrderId: "",
        error: `batch limit ${MAX_BATCH} exceeded (${ids.length})`,
        code: "batch_limit_exceeded",
      },
    ];
  }

  const results: SyncTnPaymentResult[] = [];
  for (const tnOrderId of ids) {
    results.push(
      await syncTnPaymentFromMp({ tnOrderId, force: params.force })
    );
  }
  return results;
}
