import type { Metadata } from "next";

import { ErpAnalyticsDashboard } from "@/components/erp/analytics/erp-analytics-dashboard";

export const metadata: Metadata = {
  title: "Analytics · 8CHOQ ERP",
  description: "Métricas financieras read-only desde REMITOS y Mercado Pago",
};

export default function AnalyticsPage() {
  return <ErpAnalyticsDashboard />;
}
