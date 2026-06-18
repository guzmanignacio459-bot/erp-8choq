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
  totalPrendas: number;
  hasMercadoPago: boolean;
};

/** Orden comercial TN-led — grain principal L2.1 / M2 */
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
  /** M1 — denormalizado desde tn_orders */
  customerName: string | null;
  customerDni: string | null;
  customerPhone: string | null;
  provinceLocalidad: string | null;
  paymentGateway: string | null;
  paymentMethod: string | null;
  shippingOption: string | null;
  shippingOwner: string | null;
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

/** Resultado sync MP por orden TN (M3.1b) */
export type V2PaymentSyncItemResult =
  | {
      ok: true;
      tnOrderId: string;
      mpPaymentId: string;
      action: "created" | "updated" | "skipped";
      matchRule: string;
      changedFields: string[];
      source: string;
    }
  | {
      ok: false;
      tnOrderId: string;
      error: string;
      code: string;
    };

export type V2PaymentSyncRequest = {
  /** Una orden TN */
  tnOrderId?: string;
  /** Lote (máx. 50 en staging pilot) */
  tnOrderIds?: string[];
  /** Modo legacy: fetch directo por MP payment id */
  paymentId?: number | string;
  /** Re-fetch MP aunque ya esté sincronizado */
  force?: boolean;
};

export type V2PaymentSyncResponse = {
  ok: boolean;
  results: V2PaymentSyncItemResult[];
  count: number;
  synced: number;
  skipped: number;
  failed: number;
  fetchedAt: string;
  source: "neon-staging";
  urlMeta?: V2DbUrlMeta;
  error?: string;
};

export type V2CommercialValidationFailure = {
  check: "V-C1" | "V-C2" | "V-C3" | "V-C4" | "V-C5" | "V-C6";
  message: string;
  expected?: number;
  actual?: number;
  delta?: number;
};

export type V2CommercialValidation = {
  passed: boolean;
  failures: V2CommercialValidationFailure[];
  sums: {
    discount: number;
    shipping: number;
    grossUnitAmount: number;
    netCommercialAmount: number;
  };
  audit: {
    tnDiscount: number;
    poolDiscountInferred: number;
    discountInferenceDelta: number;
  };
};

export type V2CommercialAllocateItemResult =
  | {
      ok: true;
      tnOrderId: string;
      action: "created" | "updated";
      unitCount: number;
      validation: V2CommercialValidation;
    }
  | {
      ok: false;
      tnOrderId: string;
      error: string;
      code: string;
      validation?: V2CommercialValidation;
    };

export type V2CommercialAllocateRequest = {
  tnOrderId?: string;
  tnOrderIds?: string[];
  dryRun?: boolean;
};

export type V2CommercialAllocateResponse = {
  ok: boolean;
  results: V2CommercialAllocateItemResult[];
  count: number;
  allocated: number;
  failed: number;
  units: number;
  validationFailures: Array<{
    check: V2CommercialValidationFailure["check"];
    count: number;
    orders: string[];
  }>;
  fetchedAt: string;
  source: "neon-staging";
  urlMeta?: V2DbUrlMeta;
  dryRun?: boolean;
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
