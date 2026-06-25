/**
 * M6.5.1 — Detección órdenes TN pagadas por TRANSFERENCIA
 *
 * Evidencia staging (219 pagadas):
 * - payment_method denormalizado: vacío en 100%
 * - transferencias: gateway=offline + raw.gateway_name = "transferencia o depósito bancario" (43)
 * - MP excluido: payment_gateway=mercado-pago (176)
 */

import type { TnOrder } from "@prisma/client";

export const TN_TRANSFER_METHOD_LABEL = "TRANSFERENCIA";

type TnOrderTransferInput = Pick<
  TnOrder,
  "paymentMethod" | "paymentGateway" | "rawTnPayload"
>;

function norm(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function collectPaymentSignals(raw: unknown): string[] {
  if (!raw || typeof raw !== "object") return [];
  const r = raw as Record<string, unknown>;
  const details = (r.payment_details ?? {}) as Record<string, unknown>;
  const payments = Array.isArray(r.payments) ? r.payments : [];
  const p0 = (payments[0] ?? {}) as Record<string, unknown>;

  return [
    r.gateway_name,
    r.gateway,
    r.payment_gateway,
    r.payment_method,
    r.payment_method_name,
    details.method,
    details.payment_method,
    details.payment_method_name,
    details.name,
    details.payment_type,
    p0.payment_method,
    p0.gateway,
  ]
    .map(norm)
    .filter(Boolean);
}

function hasTransferKeyword(text: string): boolean {
  return (
    text.includes("transfer") ||
    text.includes("transferencia") ||
    text.includes("depósito") ||
    text.includes("deposito") ||
    text.includes("bancario") ||
    text.includes("cbu") ||
    text.includes("alias")
  );
}

function isMercadoPagoOrder(order: TnOrderTransferInput): boolean {
  const pg = norm(order.paymentGateway);
  if (pg === "mercado-pago" || pg.includes("mercado")) return true;
  const raw = order.rawTnPayload;
  if (!raw || typeof raw !== "object") return false;
  const gateway = norm((raw as Record<string, unknown>).gateway);
  return gateway.includes("mercado");
}

/** Normaliza método de pago TN (alineado a GAS orders-paid). */
export function normalizeTnPaymentMethod(
  order: TnOrderTransferInput
): string | null {
  if (isMercadoPagoOrder(order)) return null;

  const pm = norm(order.paymentMethod);
  if (pm === "transferencia" || pm === "transfer") {
    return TN_TRANSFER_METHOD_LABEL;
  }

  const signals = collectPaymentSignals(order.rawTnPayload);
  const joined = signals.join("|");
  if (hasTransferKeyword(joined)) {
    return TN_TRANSFER_METHOD_LABEL;
  }

  return null;
}

export function isTnTransferOrder(order: TnOrderTransferInput): boolean {
  return normalizeTnPaymentMethod(order) === TN_TRANSFER_METHOD_LABEL;
}

/** Fragmento SQL para filtrar transferencias en health/backfill (Postgres). */
export const TN_TRANSFER_SQL_FILTER = `
  o.tn_paid_at IS NOT NULL
  AND LOWER(COALESCE(o.payment_gateway, '')) NOT IN ('mercado-pago', 'mercadopago')
  AND NOT (LOWER(COALESCE(o.raw_tn_payload->>'gateway', '')) LIKE '%mercado%')
  AND (
    UPPER(TRIM(COALESCE(o.payment_method, ''))) = 'TRANSFERENCIA'
    OR LOWER(COALESCE(o.raw_tn_payload->>'gateway_name', '')) LIKE '%transfer%'
    OR LOWER(COALESCE(o.raw_tn_payload->>'gateway_name', '')) LIKE '%transferencia%'
    OR LOWER(COALESCE(o.raw_tn_payload->>'gateway_name', '')) LIKE '%depósito%'
    OR LOWER(COALESCE(o.raw_tn_payload->>'gateway_name', '')) LIKE '%deposito%'
    OR LOWER(COALESCE(o.raw_tn_payload->>'gateway_name', '')) LIKE '%bancario%'
  )
`;
