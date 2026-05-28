import type { Metadata } from "next";

import { ModulePlaceholderPage } from "@/components/erp/layout/module-placeholder-page";
import { getModulePlaceholder } from "@/lib/erp/module-placeholders";

export const metadata: Metadata = {
  title: "Analytics · 8CHOQ ERP",
  description: "Métricas avanzadas y reportes — próximamente",
};

export default function AnalyticsPage() {
  return <ModulePlaceholderPage config={getModulePlaceholder("analytics")} />;
}
