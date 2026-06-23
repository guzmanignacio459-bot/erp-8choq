import type { TnCommercialStatus } from "@/types/erp-v2-api";
import type { TnErpReconciliationStatus } from "@/types/erp-v2-db";

export const COMMERCIAL_STATUS_LABELS: Record<TnCommercialStatus, string> = {
  activo: "Activo (TN)",
  cancelado: "Cancelado",
  reembolsado: "Reembolsado",
  pendiente: "Pendiente",
};

export const RECONCILIATION_STATUS_LABELS: Record<
  TnErpReconciliationStatus,
  string
> = {
  aligned: "Alineado",
  tn_only_pending_erp: "TN sin remito ERP",
  erp_only_not_in_panel: "ERP sin panel TN",
  mismatch_amount: "Monto distinto",
  unknown: "Sin reconciliar",
};

export function commercialStatusLabel(status: TnCommercialStatus): string {
  return COMMERCIAL_STATUS_LABELS[status] ?? status;
}

export function reconciliationStatusLabel(
  status: TnErpReconciliationStatus | null | undefined
): string {
  if (!status) return "—";
  return RECONCILIATION_STATUS_LABELS[status] ?? status;
}
