import type { Metadata } from "next";

import { ErpFinancialItemsDashboard } from "@/components/erp/financial-items/erp-financial-items-dashboard";

export const metadata: Metadata = {
  title: "Financial Items · 8CHOQ ERP",
  description:
    "Ítems financieros unificados — grain 1 prenda = 1 fila (M6.1 TN)",
};

export const dynamic = "force-dynamic";

export default function FinancialItemsPage() {
  return <ErpFinancialItemsDashboard />;
}
