/**
 * Tipos TypeScript — modelo DB ERP v2 (FASE L)
 * Ver docs/erp-l1-data-model.md y prisma/schema.prisma
 */

export type ErpProcessingStatus =
  | "pending_import"
  | "imported"
  | "manual_no_tn"
  | "failed";

export type TnErpReconciliationStatus =
  | "aligned"
  | "tn_only_pending_erp"
  | "erp_only_not_in_panel"
  | "mismatch_amount"
  | "unknown";

/** Snapshot Tiendanube (capa A) */
export type TnOrderSnapshot = {
  id: string;
  tnCreatedAt?: string | null;
  tnPaidAt?: string | null;
  tnStatus?: string | null;
  tnPaymentStatus?: string | null;
  tnTotal: number;
  tnSubtotal?: number | null;
  tnShipping?: number | null;
  tnDiscount?: number | null;
  tnAnalyticsCounted?: boolean | null;
  tnReportingFlags?: Record<string, unknown> | null;
  rawTnPayload?: Record<string, unknown> | null;
};

/** Remito ERP (capa B) — shape backfill L0 */
export type ErpOrderSnapshot = {
  id: string;
  tnOrderId?: string | null;
  fecha: string | null;
  fechaErp?: string | null;
  processingStatus?: ErpProcessingStatus;
  reconciliationStatus?: TnErpReconciliationStatus;
  totalFinal: number;
  totalFinalErp?: number;
  netoOperativo?: number | null;
  nombre: string;
  customerKey?: string;
  [key: string]: unknown;
};

export type L0BackfillPayload = {
  schemaVersion: string;
  erpOrders: ErpOrderSnapshot[];
  erpOrderItems: unknown[];
  tnOrders: TnOrderSnapshot[];
  tnOrderItems: unknown[];
  customers: unknown[];
  payments: unknown[];
  /** @deprecated */
  orders?: ErpOrderSnapshot[];
  orderItems?: unknown[];
};
