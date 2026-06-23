import type { Metadata } from "next";
import { Suspense } from "react";

import { ErpRemitosDashboard } from "@/components/erp/remitos/erp-remitos-dashboard";
import { ErpDashboardLoading } from "@/components/erp/shared/erp-dashboard-loading";

export const metadata: Metadata = {
  title: "Remitos · 8CHOQ ERP",
  description:
    "Listado de remitos — GAS legacy por defecto; Neon staging con ?source=neon",
};

export const dynamic = "force-dynamic";

export default function DashboardRemitosPage() {
  return (
    <Suspense
      fallback={
        <ErpDashboardLoading label="Cargando dashboard de remitos…" />
      }
    >
      <ErpRemitosDashboard />
    </Suspense>
  );
}
