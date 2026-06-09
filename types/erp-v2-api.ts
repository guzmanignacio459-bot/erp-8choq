/**
 * API ERP V2 — tipos read-only staging (L2.1)
 * Ver docs/erp-l2-commercial-mirror.md
 */

import type { ErpProcessingStatus, TnErpReconciliationStatus } from "./erp-v2-db";

/** Estado comercial visible — derivado solo de TN */
export type TnCommercialStatus =
  | "activo"
  | "cancelado"
  | "reembolsado"
  | "pendiente";

/** Enriquecimiento operativo (capa B) — opcional en orden TN */
export type V2ErpOrderEnrichment = {
  erpOrderId: string;
  fechaErp: string | null;
  totalFinalErp: number;
  netoOperativo: number | null;
  processingStatus: ErpProcessingStatus;
  reconciliationStatus: TnErpReconciliationStatus;
  reconciliationNote: string | null;
  /** Operativo GAS — no usar como estado comercial */
  estadoOperativo: string | null;
  nombre: string;
  metodoPago: string | null;
  transporte: string | null;
};

/** Orden comercial TN-led — grain principal L2.1 */
export type V2CommercialOrder = {
  tnOrderId: string;
  commercialStatus: TnCommercialStatus;
  tnStatus: string | null;
  tnPaymentStatus: string | null;
  tnTotal: number;
  tnSubtotal: number | null;
  tnShipping: number | null;
  tnDiscount: number | null;
  tnCreatedAt: string | null;
  tnPaidAt: string | null;
  tnAnalyticsCounted: boolean | null;
  tnReportingFlags: Record<string, unknown> | null;
  erp: V2ErpOrderEnrichment | null;
};

/** Remito operativo ERP-led — shadow B / paridad GAS */
export type V2RemitoOperational = {
  idRemito: string;
  fechaRaw: string;
  fechaDisplay: string;
  nombre: string;
  dni: string;
  provinciaLocalidad: string;
  telefono: string;
  transporte: string;
  metodoDePago: string;
  vendedor: string;
  condicionCompra: string;
  totalPrendas: string;
  subtotal: string;
  shippingCustomerCost: string;
  envioOwner: string;
  shippingOwnerCost: string;
  recargoDescuento: string;
  totalFinal: string;
  /** Operativo GAS */
  estadoOperativo: string;
  tnOrderId: string;
  /** Desde TN join — nunca desde estadoOperativo */
  commercialStatus: TnCommercialStatus | null;
  reconciliationStatus: TnErpReconciliationStatus | null;
  processingStatus: ErpProcessingStatus;
};

export type V2DbUrlMeta = {
  host: string;
  port: string;
  database: string;
  provider: "neon-staging" | "local-pglite" | "postgres-other";
};

export type V2OrdersListResponse = {
  ok: boolean;
  data: V2CommercialOrder[];
  count: number;
  page: number;
  perPage: number;
  total: number;
  fetchedAt: string;
  source: "neon-staging";
  urlMeta?: V2DbUrlMeta;
  kpi?: {
    from: string;
    to: string;
    ordersInRange: number;
    facturacionTotal: number;
  };
  error?: string;
};

export type V2RemitosListResponse = {
  ok: boolean;
  data: V2RemitoOperational[];
  count: number;
  fetchedAt: string;
  source: "neon-staging";
  urlMeta?: V2DbUrlMeta;
  error?: string;
};

export type L2CompareRemitosReport = {
  generatedAt: string;
  scope: { from: string; to: string };
  gas: { count: number; action: string };
  neon: { count: number };
  match: {
    idsAligned: number;
    onlyGas: string[];
    onlyNeon: string[];
    totalMismatches: Array<{
      idRemito: string;
      gasTotal: number;
      neonTotal: number;
      delta: number;
    }>;
  };
  pass: boolean;
};
