import type { Metadata } from "next";

import { ModulePlaceholderPage } from "@/components/erp/layout/module-placeholder-page";
import { getModulePlaceholder } from "@/lib/erp/module-placeholders";

export const metadata: Metadata = {
  title: "Clientes · 8CHOQ ERP",
  description: "CRM y segmentación de clientes — en preparación",
};

export default function ClientesPage() {
  return <ModulePlaceholderPage config={getModulePlaceholder("clientes")} />;
}
