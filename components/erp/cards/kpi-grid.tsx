import { KpiCard } from "@/components/erp/cards/kpi-card";
import type { ErpKpiCard } from "@/types/erp";

type KpiGridProps = {
  kpis: ErpKpiCard[];
};

export function KpiGrid({ kpis }: KpiGridProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {kpis.map((kpi, index) => (
        <KpiCard key={`${kpi.key}-${index}`} kpi={kpi} />
      ))}
    </div>
  );
}
