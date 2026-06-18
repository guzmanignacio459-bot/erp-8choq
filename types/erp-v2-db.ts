/**
 * Tipos TypeScript — modelo DB ERP v2 (FASE L + M1 TN-first)
 * Ver docs/erp-l1-data-model.md, docs/erp-m0-tn-first-adr.md, prisma/schema.prisma
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

export type TnOrderChannel = "ecommerce";

export type TnCommercialStatus =
  | "activo"
  | "cancelado"
  | "reembolsado"
  | "pendiente";

export type TnFulfillmentStatus =
  | "pending"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled";

/** Origen remito ERP — no incluye ecommerce obligatorio */
export type ErpOrderSource =
  | "legacy_gas_import"
  | "manual"
  | "wholesale"
  | "showroom"
  | "internal";

/** Snapshot Tiendanube — entidad principal ecommerce (M1) */
export type TnOrderSnapshot = {
  id: string;
  channel?: TnOrderChannel;
  commercialStatus?: TnCommercialStatus | null;
  commercialStatusAt?: string | null;
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
  customerName?: string | null;
  customerDni?: string | null;
  customerPhone?: string | null;
  provinceLocalidad?: string | null;
  paymentGateway?: string | null;
  paymentMethod?: string | null;
  shippingOption?: string | null;
  shippingOwner?: string | null;
  mpPaymentId?: string | null;
  netoMpOrden?: number | null;
  mpFeeTotal?: number | null;
  mpCostTotal?: number | null;
  fulfillmentStatus?: TnFulfillmentStatus | null;
  allocatedAt?: string | null;
  stockDeductedAt?: string | null;
};

/** Unidad física (1 prenda) — M4.1 grain operativo */
export type TnOrderItemUnitSnapshot = {
  id: string;
  tnOrderId: string;
  tnOrderItemId: string;
  unitIndex: number;
  sku?: string | null;
  talle?: string | null;
  owner?: string | null;
  unitPrice: number;
  isGifty?: boolean;
  isStockable?: boolean;
  parseWarnings?: string[] | null;
  source?: string;
};

/** Prorrateo comercial por unidad TN — M4.2 */
export type TnOrderItemAllocationSnapshot = {
  tnOrderId: string;
  tnOrderItemId: string;
  tnOrderItemUnitId: string;
  grossUnitAmount?: number;
  discountAllocated?: number;
  shippingAllocated?: number;
  feeAllocated?: number;
  netoPrenda?: number;
  netoPrendaReal?: number | null;
  owner?: string | null;
  netoPrendaScnl?: number | null;
  netoPrenda8q?: number | null;
  source?: string;
};

/** Remito ERP — manual / interno / legacy (capa B) */
export type ErpOrderSnapshot = {
  id: string;
  orderSource?: ErpOrderSource;
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
