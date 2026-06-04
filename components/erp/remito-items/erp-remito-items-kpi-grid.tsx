"use client";

import {
  DollarSign,
  Package,
  Percent,
  Shirt,
  Tag,
  Truck,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import {
  formatAnalyticsCount,
  formatAnalyticsCurrency,
} from "@/lib/erp/analytics-format";
import { REMITO_ITEMS_KPI_COPY } from "@/lib/erp/remito-items-kpi-copy";
import { cn } from "@/lib/utils";
import type { ErpRemitoItemsSummary } from "@/types/erp";

type KpiAccent = "violet" | "cyan" | "emerald" | "amber" | "rose" | "blue";

const ACCENT_CLASS: Record<KpiAccent, string> = {
  violet: "erp-kpi-accent-violet",
  cyan: "erp-kpi-accent-cyan",
  emerald: "erp-kpi-accent-emerald",
  amber: "erp-kpi-accent-amber",
  rose: "erp-kpi-accent-rose",
  blue: "erp-kpi-accent-blue",
};

type ErpRemitoItemsKpiGridProps = {
  summary: ErpRemitoItemsSummary;
  periodLabel?: string;
};

export function ErpRemitoItemsKpiGrid({
  summary,
  periodLabel,
}: ErpRemitoItemsKpiGridProps) {
  const hint = periodLabel ? `Período: ${periodLabel}` : "REMITO_ITEMS read-only";

  const items: {
    label: string;
    value: string;
    hint: string;
    icon: LucideIcon;
    accent: KpiAccent;
  }[] = [
    {
      label: REMITO_ITEMS_KPI_COPY.brutoLista.label,
      value: formatAnalyticsCurrency(summary.totalBrutoPrendas),
      hint: REMITO_ITEMS_KPI_COPY.brutoLista.hint,
      icon: Tag,
      accent: "cyan",
    },
    {
      label: "Total prendas",
      value: formatAnalyticsCount(summary.totalPrendas),
      hint,
      icon: Package,
      accent: "blue",
    },
    {
      label: REMITO_ITEMS_KPI_COPY.netoPrenda.label,
      value: formatAnalyticsCurrency(summary.netoTotalPrendas),
      hint: REMITO_ITEMS_KPI_COPY.netoPrenda.hint,
      icon: Wallet,
      accent: "emerald",
    },
    {
      label: REMITO_ITEMS_KPI_COPY.descuento.label,
      value: formatAnalyticsCurrency(summary.descuentoTotal),
      hint: REMITO_ITEMS_KPI_COPY.descuento.hint,
      icon: Percent,
      accent: "amber",
    },
    {
      label: REMITO_ITEMS_KPI_COPY.shipping.label,
      value: formatAnalyticsCurrency(summary.shippingTotal),
      hint: REMITO_ITEMS_KPI_COPY.shipping.hint,
      icon: Truck,
      accent: "blue",
    },
    {
      label: REMITO_ITEMS_KPI_COPY.fee.label,
      value: formatAnalyticsCurrency(summary.feeTotal),
      hint: REMITO_ITEMS_KPI_COPY.fee.hint,
      icon: DollarSign,
      accent: "violet",
    },
    {
      label: REMITO_ITEMS_KPI_COPY.mpFee.label,
      value: formatAnalyticsCurrency(summary.mpFeeAsignadoRealTotal),
      hint: REMITO_ITEMS_KPI_COPY.mpFee.hint,
      icon: DollarSign,
      accent: "rose",
    },
    {
      label: "Unidades SCNL",
      value: formatAnalyticsCount(summary.unidadesScnl),
      hint: "Owner SCNL",
      icon: Shirt,
      accent: "cyan",
    },
    {
      label: "Unidades 8Q",
      value: formatAnalyticsCount(summary.unidades8q),
      hint: "Owner 8Q",
      icon: Shirt,
      accent: "violet",
    },
  ];

  return (
    <div className="space-y-3">
      <p className="text-[10px] leading-relaxed text-[hsl(var(--erp-fg-muted))]">
        Montos agregados desde REMITO_ITEMS. El neto por prenda (NETO_PRENDA) es
        el comparable a facturación (Total Final) por remito; bruto lista y
        descuento comercial no representan facturación total.
      </p>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <article
            key={`kpi-${item.label}`}
            className={cn(
              "erp-card erp-card-glow relative p-4 sm:p-5",
              ACCENT_CLASS[item.accent]
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-medium uppercase tracking-wider text-[hsl(var(--erp-fg-muted))]">
                  {item.label}
                </p>
                <p className="mt-2 text-lg font-semibold text-[hsl(var(--erp-fg))] sm:text-xl">
                  {item.value}
                </p>
                <p className="mt-2 text-[10px] text-[hsl(var(--erp-fg-muted))]">
                  {item.hint}
                </p>
              </div>
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[hsl(var(--erp-border))]"
                style={{
                  background: "hsl(var(--kpi-accent) / 0.12)",
                  color: "hsl(var(--kpi-accent))",
                }}
              >
                <Icon className="h-4 w-4" />
              </div>
            </div>
          </article>
        );
      })}
    </div>
    </div>
  );
}
