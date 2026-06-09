/**
 * Estado comercial visible — derivado exclusivamente de TN (L2.1)
 */

import type { TnCommercialStatus } from "@/types/erp-v2-api";

export type TnCommercialStatusInput = {
  tnStatus?: string | null;
  tnPaymentStatus?: string | null;
  tnReportingFlags?: Record<string, unknown> | null;
  rawTnPayload?: Record<string, unknown> | null;
};

function rawCancelledAt(raw: Record<string, unknown> | null | undefined): boolean {
  if (!raw) return false;
  const v = raw.cancelled_at;
  if (v == null || v === "" || v === false) return false;
  return true;
}

/**
 * Mapeo TN → estado comercial ERP visible.
 * Nunca leer erp_orders.estado aquí.
 */
export function deriveTnCommercialStatus(
  input: TnCommercialStatusInput
): TnCommercialStatus {
  const st = String(input.tnStatus ?? "").toLowerCase();
  const ps = String(input.tnPaymentStatus ?? "").toLowerCase();
  const flags = (input.tnReportingFlags ?? {}) as Record<string, unknown>;
  const raw = (input.rawTnPayload ?? null) as Record<string, unknown> | null;

  if (
    st === "cancelled" ||
    st === "canceled" ||
    flags.cancelled === true ||
    rawCancelledAt(raw)
  ) {
    return "cancelado";
  }

  if (ps === "refunded" || ps === "voided") {
    return "reembolsado";
  }

  if (ps === "paid" || ps === "authorized" || ps === "pagado") {
    return "activo";
  }

  if (raw?.paid_at) {
    return "activo";
  }

  return "pendiente";
}

export function matchesCommercialStatusFilter(
  status: TnCommercialStatus,
  filter: string | null | undefined
): boolean {
  if (!filter || filter === "all") return true;
  const f = filter.toLowerCase() as TnCommercialStatus;
  return status === f;
}
