import { ArrowRightLeft, DollarSign, Layers, Percent, Receipt, TrendingDown, Truck } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import {
  formatRemitosCount,
  formatRemitosCurrency,
} from "@/lib/erp/remitos-kpis";
import { cn } from "@/lib/utils";
import type { V2FinancialItemsKpi } from "@/types/erp-v2-financial-items";

type KpiCard = {
  label: string;
  value: string;
  icon: LucideIcon;
  accent: "violet" | "cyan" | "emerald" | "amber" | "rose";
};

const ACCENT: Record<KpiCard["accent"], string> = {
  violet: "erp-kpi-accent-violet",
  cyan: "erp-kpi-accent-cyan",
  emerald: "erp-kpi-accent-emerald",
  amber: "erp-kpi-accent-amber",
  rose: "erp-kpi-accent-rose",
};

type Props = {
  kpi: V2FinancialItemsKpi;
  periodLabel?: string;
};

export function ErpFinancialItemsKpiGrid({ kpi, periodLabel }: Props) {
  const hint = periodLabel ? `Según filtros · ${periodLabel}` : "Según filtros activos";

  const cards: KpiCard[] = [
    {
      label: "Financial Items",
      value: formatRemitosCount(kpi.itemCount),
      icon: Layers,
      accent: "violet",
    },
    {
      label: "Venta Bruta",
      value: formatRemitosCurrency(kpi.grossTotal),
      icon: Receipt,
      accent: "cyan",
    },
    {
      label: "Descuentos",
      value: formatRemitosCurrency(kpi.discountTotal),
      icon: Percent,
      accent: "amber",
    },
    {
      label: "Fee TN",
      value: formatRemitosCurrency(kpi.tnFeeTotal),
      icon: TrendingDown,
      accent: "rose",
    },
    {
      label: "Fee MP",
      value: formatRemitosCurrency(kpi.mpFeeTotal),
      icon: DollarSign,
      accent: "amber",
    },
    {
      label: "Shipping",
      value: formatRemitosCurrency(kpi.shippingTotal),
      icon: Truck,
      accent: "cyan",
    },
    {
      label: "Transfer Fees",
      value: formatRemitosCurrency(kpi.transferFeeTotal),
      icon: ArrowRightLeft,
      accent: "violet",
    },
    {
      label: "Net Real",
      value: formatRemitosCurrency(kpi.netTotal),
      icon: DollarSign,
      accent: "emerald",
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
      {cards.map((card) => (
        <div key={card.label} className={cn("erp-kpi-card", ACCENT[card.accent])}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-[hsl(var(--erp-fg-subtle))]">
                {card.label}
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-[hsl(var(--erp-fg))]">
                {card.value}
              </p>
              <p className="mt-1 text-[10px] text-[hsl(var(--erp-fg-muted))]">{hint}</p>
            </div>
            <card.icon className="h-4 w-4 shrink-0 opacity-70" />
          </div>
        </div>
      ))}
    </div>
  );
}
