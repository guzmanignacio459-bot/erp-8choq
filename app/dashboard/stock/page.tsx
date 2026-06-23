import type { Metadata } from "next";

import { ModulePlaceholderPage } from "@/components/erp/layout/module-placeholder-page";
import { getModulePlaceholder } from "@/lib/erp/module-placeholders";

export const metadata: Metadata = {
  title: "Stock · 8CHOQ ERP",
  description: "Monitoreo de stock y alertas — en preparación",
};

export default function StockPage() {
  return <ModulePlaceholderPage config={getModulePlaceholder("stock")} />;
}
