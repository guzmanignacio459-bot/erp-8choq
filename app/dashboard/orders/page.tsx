import type { Metadata } from "next";
import { Suspense } from "react";

import { TnOrdersDashboard } from "@/components/erp/orders/tn-orders-dashboard";
import { ErpDashboardLoading } from "@/components/erp/shared/erp-dashboard-loading";

export const metadata: Metadata = {
  title: "Órdenes TN · 8CHOQ ERP",
  description:
    "Ventas ecommerce Tiendanube — grain tn_orders desde Neon staging (ERP V2)",
};

export const dynamic = "force-dynamic";

export default function DashboardOrdersPage() {
  return (
    <Suspense
      fallback={
        <ErpDashboardLoading label="Cargando dashboard de órdenes TN…" />
      }
    >
      <TnOrdersDashboard />
    </Suspense>
  );
}
