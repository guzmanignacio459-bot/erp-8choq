import type { Metadata } from "next";

import { ModulePlaceholderPage } from "@/components/erp/layout/module-placeholder-page";
import { getModulePlaceholder } from "@/lib/erp/module-placeholders";

export const metadata: Metadata = {
  title: "Ventas · 8CHOQ ERP",
  description: "Módulo de ventas consolidadas — en preparación",
};

export default function VentasPage() {
  return <ModulePlaceholderPage config={getModulePlaceholder("ventas")} />;
}
