import type { Metadata } from "next";

import { ErpSystemDashboard } from "@/components/erp/system/erp-system-dashboard";

export const metadata: Metadata = {
  title: "Sistema · 8CHOQ ERP",
  description: "Pipeline health, KPIs y drift detection — ERP V2 staging",
};

export const dynamic = "force-dynamic";

export default function DashboardSystemPage() {
  return <ErpSystemDashboard />;
}
