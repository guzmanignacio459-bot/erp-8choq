import type { Metadata } from "next";

import { ModulePlaceholderPage } from "@/components/erp/layout/module-placeholder-page";
import { getModulePlaceholder } from "@/lib/erp/module-placeholders";

export const metadata: Metadata = {
  title: "Ítems de remito · 8CHOQ ERP",
  description: "Detalle granular por línea de remito — próximamente",
};

export default function RemitoItemsPage() {
  return <ModulePlaceholderPage config={getModulePlaceholder("remito-items")} />;
}
