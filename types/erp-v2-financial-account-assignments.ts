/**
 * M6.5.1 — Types Financial Account Assignments
 */

import type {
  V2FinancialAccountRow,
  V2FinancialAccountsKpi,
} from "@/types/erp-v2-financial-accounts";

export type FinancialAssignmentOriginType = "TN_ORDER" | "REMITO";
export type FinancialAssignmentSource = "MANUAL" | "PERIOD" | "DEFAULT";

export type V2FinancialAccountAssignmentRow = {
  id: string;
  originType: FinancialAssignmentOriginType;
  originId: string;
  accountId: string;
  accountName: string;
  accountColor: string;
  assignmentSource: FinancialAssignmentSource;
  assignedAt: string;
  ratePercentSnapshot: number;
  createdAt: string;
};

export type V2FinancialAccountPeriodRow = {
  id: string;
  accountId: string;
  accountName: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
};

export type V2TransferAssignmentKpi = {
  transferOrdersTotal: number;
  transferAssigned: number;
  transferUnassigned: number;
  activeAccountId: string | null;
  activeAccountName: string | null;
  activePeriodId: string | null;
};

export type V2FinancialAccountsDashboardResponse = {
  ok: boolean;
  data: V2FinancialAccountRow[];
  count: number;
  kpi: V2FinancialAccountsKpi | null;
  assignments: V2TransferAssignmentKpi | null;
  recentAssignments: V2FinancialAccountAssignmentRow[];
  fetchedAt: string;
  source: string;
  error?: string;
};

export type V2FinancialAccountPeriodCreateInput = {
  accountId: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  isActive?: boolean;
};
