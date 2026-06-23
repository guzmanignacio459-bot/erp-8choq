import type { Metadata } from "next";

import { ErpImportacionesDashboard } from "@/components/erp/importaciones/erp-importaciones-dashboard";

export const metadata: Metadata = {
  title: "Importaciones · 8CHOQ ERP",
  description:
    "Importar órdenes pagadas de Tiendanube al ERP — wrapper seguro desde dashboard",
};

export const dynamic = "force-dynamic";

export default function DashboardImportacionesPage() {
  return <ErpImportacionesDashboard />;
}
