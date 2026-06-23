import type { Metadata } from "next";

import { ModulePlaceholderPage } from "@/components/erp/layout/module-placeholder-page";
import { getModulePlaceholder } from "@/lib/erp/module-placeholders";

export const metadata: Metadata = {
  title: "Configuración · 8CHOQ ERP",
  description: "Parámetros e integraciones del ERP — en preparación",
};

export default function ConfiguracionPage() {
  return (
    <ModulePlaceholderPage config={getModulePlaceholder("configuracion")} />
  );
}
