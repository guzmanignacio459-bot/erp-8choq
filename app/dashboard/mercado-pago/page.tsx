import type { Metadata } from "next";

import { ModulePlaceholderPage } from "@/components/erp/layout/module-placeholder-page";
import { getModulePlaceholder } from "@/lib/erp/module-placeholders";

export const metadata: Metadata = {
  title: "Mercado Pago · 8CHOQ ERP",
  description: "Cobros y conciliación Mercado Pago — próximamente",
};

export default function MercadoPagoPage() {
  return (
    <ModulePlaceholderPage config={getModulePlaceholder("mercado-pago")} />
  );
}
