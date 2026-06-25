/**
 * ERP V2 M6 — Financial Items (fuente financiera unificada)
 */

export type FinancialItemOriginType = "TN_ORDER" | "REMITO";

export type V2FinancialItemRow = {
  id: string;
  originType: FinancialItemOriginType;
  originId: string;
  originItemId: string;
  unitKey: string;
  date: string;
  customerName: string | null;
  sku: string;
  productName: string;
  variantName: string | null;
  quantity: number;
  grossAmount: number;
  discountAllocated: number;
  tnFeeAllocated: number;
  mpFeeAllocated: number;
  shippingAllocated: number;
  transferFeeAllocated: number;
  metaAdsAllocated: number | null;
  netAmount: number;
  paymentMethod: string | null;
  status: string;
  sourceCreatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type V2FinancialItemsKpi = {
  itemCount: number;
  grossTotal: number;
  discountTotal: number;
  tnFeeTotal: number;
  mpFeeTotal: number;
  shippingTotal: number;
  transferFeeTotal: number;
  netTotal: number;
};

export type V2FinancialItemsListResponse = {
  ok: boolean;
  data: V2FinancialItemRow[];
  count: number;
  page: number;
  perPage: number;
  total: number;
  fetchedAt: string;
  source: "neon-staging";
  kpi?: V2FinancialItemsKpi;
  error?: string;
};

export type GenerateFromTnResult = {
  processed: number;
  created: number;
  updated: number;
  skippedNoAllocation: number;
  errors: number;
  dryRun: boolean;
};
