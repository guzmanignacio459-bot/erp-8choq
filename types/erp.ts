/** Tipos base del ERP 8Q — Fase 1 (shell + overview mock) */

export type ErpKpiKey =
  | "ventasTotales"
  | "remitos"
  | "ordenesImportadas"
  | "netoReal"
  | "stockBajo"
  | "pendientes"
  | "mercadoPago"
  | "conversion";

export type ErpKpiTrend = "up" | "down" | "neutral";

export type ErpKpiCard = {
  key: ErpKpiKey;
  label: string;
  value: string;
  rawValue?: number;
  change: string;
  trend: ErpKpiTrend;
  hint: string;
  accent: "violet" | "cyan" | "emerald" | "amber" | "rose" | "blue" | "orange" | "pink";
};

export type ErpNavItem = {
  id: string;
  label: string;
  href: string;
  icon: string;
  badge?: string;
  comingSoon?: boolean;
};

export type ErpNavSection = {
  id: string;
  title: string;
  items: ErpNavItem[];
};

export type ErpRecentOrder = {
  id: string;
  canal: "Tiendanube" | "Mercado Pago" | "Manual";
  cliente: string;
  monto: number;
  estado: "Pagado" | "Pendiente" | "Importado" | "Conciliado";
  fecha: string;
};

export type ErpActivityItem = {
  id: string;
  tipo: "import" | "remito" | "stock" | "pago";
  titulo: string;
  descripcion: string;
  timestamp: string;
};

export type ErpDashboardOverview = {
  periodo: string;
  actualizadoEn: string;
  kpis: ErpKpiCard[];
  ordenesRecientes: ErpRecentOrder[];
  actividad: ErpActivityItem[];
  resumen: {
    ordenesHoy: number;
    remitosAbiertos: number;
    alertasStock: number;
    tasaConciliacion: number;
  };
};

export type ErpDataSource = "mock" | "apps-script";

export type ErpApiResponse<T> = {
  ok: boolean;
  data: T;
  source: ErpDataSource;
  fetchedAt: string;
};

/**
 * Remito serializado para el dashboard ERP (Fase 2).
 * Mapeado desde columnas reales de la hoja REMITOS — solo lectura, sin recálculos.
 */
export type ErpRemito = {
  idRemito: string;
  /** Valor crudo (ISO / sheet) — usado para orden y filtros */
  fechaRaw: string;
  /** Presentación DD/MM/YYYY HH:mm */
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
  /** Columna textual "Envio Owner" / "Envío Owner" */
  envioOwner: string;
  shippingOwnerCost: string;
  recargoDescuento: string;
  totalFinal: string;
  estado: string;
  tnOrderId: string;
  /** MP — mapeados pero no columnas principales del dashboard */
  mpPaymentId?: string;
  mpTotalCostReal?: string;
  mpNetoRealOrden?: string;
  mpStatus?: string;
  mpFeeTotalReal?: string;
  mpPlatformFeeTotalReal?: string;
  mpTransactionAmount?: string;
};

/** Ítem display-only desde getRemito → REMITO_ITEMS */
export type ErpRemitoDetailItem = {
  sku: string;
  articulo: string;
  talle: string;
  cantidad: string;
  precioUnitario: string;
};

/** Detalle read-only — cabecera REMITOS + items[] de getRemito */
export type ErpRemitoDetail = ErpRemito & {
  detalleGeneral?: string;
  mpStatusDetail?: string;
  mpPaymentType?: string;
  mpPaymentMethod?: string;
  mpInstallments?: string;
  mpTransactionAmount?: string;
  mpNetReceivedAmount?: string;
  mpTaxTotalReal?: string;
  mpFinancingTotalReal?: string;
  mpFeeTotalReal?: string;
  mpPlatformFeeTotalReal?: string;
  mpCostPercentReal?: string;
  mpDateApproved?: string;
  mpImportedAt?: string;
  mpPayerEmail?: string;
  items: ErpRemitoDetailItem[];
};

export type ErpRemitoDetailResponse = {
  ok: boolean;
  data: ErpRemitoDetail | null;
  fetchedAt: string;
  source: "apps-script";
  gasActionUsed?: string;
  attemptedActions?: string[];
  error?: string;
};

/** POST /api/erp/mp/apply — delegación a import-payment */
export type ErpMpApplyRequestBody = {
  tnOrderId: string;
  force?: boolean;
};

export type ErpMpApplyResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  tnOrderId?: string;
  mpPaymentId?: string;
  correlationId?: string;
  message?: string;
  error?: string;
  httpStatus?: number;
  rawBody?: string;
  details?: Record<string, unknown>;
};

export type ErpMpApplyResponse = ErpMpApplyResult & {
  fetchedAt: string;
  source: "erp-wrapper";
};

export type ErpRemitosDataShape = "full" | "summary" | "unknown";

export type ErpRemitosGasAttemptError = {
  action: string;
  httpStatus: number;
  message: string;
  rawResponse: unknown;
};

export type ErpRemitosDebugPayload = {
  rowCount: number;
  listActionUsed: string;
  attemptedActions: string[];
  fallbackFrom?: string;
  fallbackAttemptError?: ErpRemitosGasAttemptError;
  dataShape: ErpRemitosDataShape;
  payloadTopLevelKeys: string[];
  rawFirstRowKeys: string[];
  rawFirstRow: unknown;
  mappedFirstRow: ErpRemito | null;
};

export type ErpRemitosListResponse = {
  ok: boolean;
  data: ErpRemito[];
  count: number;
  fetchedAt: string;
  source: "apps-script";
  listActionUsed?: string;
  error?: string;
  /** Solo con ?debug=1 — temporal para diagnóstico de mapper */
  debug?: ErpRemitosDebugPayload;
};

/** Placeholder de módulos — Fase 1.5 (sin APIs reales) */

export type ErpModuleStatus = "coming-soon" | "in-preparation";

export type ErpModuleMockStat = {
  label: string;
  value: string;
  hint?: string;
};

export type ErpModulePageConfig = {
  slug: string;
  title: string;
  description: string;
  status: ErpModuleStatus;
  statusLabel: string;
  integrations: string[];
  mockStats: ErpModuleMockStat[];
  plannedFeatures: string[];
};

/** Analytics — Fase 3.1 (read-only REMITOS + futuro REMITO_ITEMS / Meta) */

export type ErpAnalyticsSource =
  | "getAnalyticsSummary"
  | "listRemitosFull-fallback";

export type ErpAnalyticsMetaMetricKey =
  | "spend"
  | "mer"
  | "roas"
  | "cpa"
  | "cac"
  | "contribucionNeta";

export type ErpAnalyticsMetaPlaceholder = {
  connected: false;
  plannedMetrics: ErpAnalyticsMetaMetricKey[];
};

export type ErpAnalyticsTotals = {
  facturacionTotal: number;
  netoRealMp: number;
  costoTotalMp: number;
  feeMp: number;
  platformFee: number;
  ordenesTotales: number;
  ordenesConMp: number;
  ordenesSinMp: number;
  prendasVendidas: number;
  ticketPromedio: number;
  netoPromedioPorOrden: number;
  costoMpPercentPromedio: number;
};

export type ErpAnalyticsDaySale = {
  date: string;
  facturacion: number;
  ordenes: number;
};

export type ErpAnalyticsTopProduct = {
  sku: string;
  articulo: string;
  unidades: number;
};

export type ErpAnalyticsTopProductsSection = {
  available: boolean;
  items: ErpAnalyticsTopProduct[];
  unavailableReason?: string;
};

export type ErpAnalyticsSummary = {
  totals: ErpAnalyticsTotals;
  salesByDay: ErpAnalyticsDaySale[];
  topProducts: ErpAnalyticsTopProductsSection;
  meta: ErpAnalyticsMetaPlaceholder;
  analyticsSource: ErpAnalyticsSource;
  remitosInScope: number;
};

export type ErpAnalyticsResponse = {
  ok: boolean;
  data: ErpAnalyticsSummary | null;
  fetchedAt: string;
  source: "apps-script";
  gasActionUsed?: string;
  attemptedActions?: string[];
  error?: string;
};
