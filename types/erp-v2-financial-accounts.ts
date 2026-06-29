/**
 * ERP V2 M6.4 — Financial Accounts (catálogo de cuentas financieras)
 */

export type V2FinancialAccountRow = {
  id: string;
  name: string;
  displayName: string | null;
  ratePercent: number;
  color: string;
  isActive: boolean;
  isDefault: boolean;
  /** M6.6.1 — SUM(tn_total) − SUM(transfer_fee) por assignments */
  operatingBalance: number;
  billingTotal: number;
  transferFeeTotal: number;
  createdAt: string;
  updatedAt: string;
};

export type V2FinancialAccountsCurrentDestination = {
  id: string;
  name: string;
  displayName: string | null;
  ratePercent: number;
};

export type V2FinancialAccountsKpi = {
  totalCount: number;
  activeCount: number;
  inactiveCount: number;
  avgRatePercent: number;
  zeroRateCount: number;
  currentDestination: V2FinancialAccountsCurrentDestination | null;
};

export type V2FinancialAccountCreateInput = {
  name: string;
  displayName?: string | null;
  ratePercent?: number;
  color?: string;
  isDefault?: boolean;
};

export type V2FinancialAccountUpdateInput = {
  name?: string;
  displayName?: string | null;
  ratePercent?: number;
  color?: string;
  isActive?: boolean;
  isDefault?: boolean;
};

export type V2FinancialAccountsListResponse = {
  ok: boolean;
  data: V2FinancialAccountRow[];
  count: number;
  kpi: V2FinancialAccountsKpi | null;
  fetchedAt: string;
  source: string;
  error?: string;
};

export type V2FinancialAccountMutationResponse = {
  ok: boolean;
  data: V2FinancialAccountRow | null;
  fetchedAt: string;
  source: string;
  error?: string;
};
