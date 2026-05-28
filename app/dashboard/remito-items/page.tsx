import type { Metadata } from "next";

import { ErpRemitoItemsDashboard } from "@/components/erp/remito-items/erp-remito-items-dashboard";

export const metadata: Metadata = {
  title: "Ítems de remito · 8CHOQ ERP",
  description:
    "Detalle granular por prenda desde REMITO_ITEMS — read-only, 1 prenda = 1 fila",
};

export default function RemitoItemsPage() {
  return <ErpRemitoItemsDashboard />;
}
