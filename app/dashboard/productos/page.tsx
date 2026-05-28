import type { Metadata } from "next";

import { ModulePlaceholderPage } from "@/components/erp/layout/module-placeholder-page";
import { getModulePlaceholder } from "@/lib/erp/module-placeholders";

export const metadata: Metadata = {
  title: "Productos · 8CHOQ ERP",
  description: "Catálogo maestro de productos — en preparación",
};

export default function ProductosPage() {
  return <ModulePlaceholderPage config={getModulePlaceholder("productos")} />;
}
