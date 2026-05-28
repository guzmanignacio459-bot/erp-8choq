import type { Metadata } from "next";

import { ErpRemitosDashboard } from "@/components/erp/remitos/erp-remitos-dashboard";

export const metadata: Metadata = {
  title: "Remitos · 8CHOQ ERP",
  description: "Listado de remitos reales desde Apps Script — solo lectura",
};

export const dynamic = "force-dynamic";

export default function DashboardRemitosPage() {
  return <ErpRemitosDashboard />;
}
