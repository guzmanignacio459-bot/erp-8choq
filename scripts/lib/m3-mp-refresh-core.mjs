/**
 * M3.1b-3 — sync runner CLI (mirror services/erp-v2-payments-sync.ts)
 */

import { denormTnMpHeaders } from "./m3-mp-denorm.mjs";
import { inferTnOrderIdFromMp, normalizeMpPayment } from "./m3-mp-normalize.mjs";

const MP_SYNC_SOURCE = "mp_api_sync_staging";
const MP_DELAY_MS = Number(process.env.M3_MP_DELAY_MS ?? 300);

function getMpToken() {
  const token = (process.env.MP_ACCESS_TOKEN ?? "").trim();
  if (!token) throw new Error("MP_ACCESS_TOKEN missing");
  return token;
}

function needsMpApiRefresh(existing, force) {
  if (force) return true;
  if (!existing) return true;
  if (!existing.mpDateApproved || !existing.mpImportedAt) return true;
  if (existing.source !== MP_SYNC_SOURCE) return true;
  return false;
}

async function fetchMpPaymentById(paymentId) {
  const token = getMpToken();
  const url = `https://api.mercadopago.com/v1/payments/${paymentId}`;
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
      continue;
    }
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
    if (!res.ok) return { ok: false, status: res.status, data };
    return { ok: true, data };
  }
  throw lastErr ?? new Error("mp_fetch_retries_exhausted");
}

export async function syncTnPaymentFromMp(prisma, tnOrderId, { force = false } = {}) {
  const id = String(tnOrderId ?? "").trim();
  if (!id) {
    return { ok: false, tnOrderId: "", error: "tnOrderId required", code: "tn_order_id_required" };
  }

  const tn = await prisma.tnOrder.findUnique({
    where: { id },
    include: { erpOrder: { select: { id: true } } },
  });
  if (!tn) {
    return { ok: false, tnOrderId: id, error: "tn_order not found", code: "tn_order_not_found" };
  }

  const erpOrderId = tn.erpOrder?.id ?? null;
  let existing = await prisma.payment.findFirst({
    where: { tnOrderId: id },
    orderBy: { updatedAt: "desc" },
  });

  if (!needsMpApiRefresh(existing, force)) {
    return {
      ok: true,
      tnOrderId: id,
      mpPaymentId: existing.mpPaymentId,
      action: "skipped",
      source: existing.source,
    };
  }

  const pid = Number(existing?.mpPaymentId ?? tn.mpPaymentId);
  if (!pid || Number.isNaN(pid)) {
    return { ok: false, tnOrderId: id, error: "no mp_payment_id", code: "no_mp_payment_id" };
  }

  const fetch = await fetchMpPaymentById(pid);
  await new Promise((r) => setTimeout(r, MP_DELAY_MS));

  if (!fetch.ok) {
    return {
      ok: false,
      tnOrderId: id,
      error: `MP fetch failed (${fetch.status})`,
      code: "mp_fetch_failed",
    };
  }

  const inferred = inferTnOrderIdFromMp(fetch.data);
  if (inferred.tnOrderId && inferred.tnOrderId !== id) {
    return {
      ok: false,
      tnOrderId: id,
      error: `MP tn mismatch: ${inferred.tnOrderId}`,
      code: "mp_tn_mismatch",
    };
  }

  const normalized = normalizeMpPayment(fetch.data, pid);
  const now = new Date();
  const data = {
    tnOrderId: id,
    erpOrderId,
    mpPaymentId: normalized.mpPaymentId,
    mpAdditionalReference: normalized.mpAdditionalReference,
    mpMatchRule: "existing_mp_payment_id",
    mpMatchConfidence: "0.95",
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

  await prisma.payment.update({ where: { id: existing.id }, data });
  await denormTnMpHeaders(prisma, [id]);

  return {
    ok: true,
    tnOrderId: id,
    mpPaymentId: normalized.mpPaymentId,
    action: "updated",
    source: MP_SYNC_SOURCE,
    normalized,
  };
}

export async function syncBatch(prisma, tnOrderIds, opts = {}) {
  const results = [];
  for (const tnOrderId of tnOrderIds) {
    results.push(await syncTnPaymentFromMp(prisma, tnOrderId, opts));
  }
  return results;
}

export function paymentSnapshotRow(row) {
  return {
    tnOrderId: row.tnOrderId,
    mpPaymentId: row.mpPaymentId,
    source: row.source,
    mpNetoRealOrden: row.mpNetoRealOrden != null ? Number(row.mpNetoRealOrden) : null,
    mpFeeTotalReal: row.mpFeeTotalReal != null ? Number(row.mpFeeTotalReal) : null,
    mpTaxTotalReal: row.mpTaxTotalReal != null ? Number(row.mpTaxTotalReal) : null,
    mpFinancingTotalReal:
      row.mpFinancingTotalReal != null ? Number(row.mpFinancingTotalReal) : null,
    mpTransactionAmount:
      row.mpTransactionAmount != null ? Number(row.mpTransactionAmount) : null,
    mpTotalCostReal: row.mpTotalCostReal != null ? Number(row.mpTotalCostReal) : null,
    mpDateApproved: row.mpDateApproved?.toISOString?.() ?? null,
  };
}
