import type { Metadata } from "next";

import { ErpFinancialAccountsDashboard } from "@/components/erp/financial-accounts/erp-financial-accounts-dashboard";

export const metadata: Metadata = {
  title: "Financial Accounts · 8CHOQ ERP",
  description: "Catálogo de cuentas financieras",
};

export const dynamic = "force-dynamic";

export default function FinancialAccountsPage() {
  return <ErpFinancialAccountsDashboard />;
}
