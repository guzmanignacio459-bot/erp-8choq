"use client";

import {
  CreditCard,
  DollarSign,
  Percent,
  Receipt,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import {
  formatAnalyticsCount,
  formatAnalyticsCurrency,
  formatAnalyticsPercent,
} from "@/lib/erp/analytics-format";
import { cn } from "@/lib/utils";
import type { ErpAnalyticsTotals } from "@/types/erp";

type KpiAccent = "violet" | "cyan" | "emerald" | "amber" | "rose" | "blue";

type AnalyticsKpiItem = {
  label: string;
  value: string;
  hint: string;
  icon: LucideIcon;
  accent: KpiAccent;
};

const ACCENT_CLASS: Record<KpiAccent, string> = {
  violet: "erp-kpi-accent-violet",
  cyan: "erp-kpi-accent-cyan",
  emerald: "erp-kpi-accent-emerald",
  amber: "erp-kpi-accent-amber",
  rose: "erp-kpi-accent-rose",
  blue: "erp-kpi-accent-blue",
};

type ErpAnalyticsKpiGridProps = {
  totals: ErpAnalyticsTotals;
  periodLabel?: string;
};

export function ErpAnalyticsKpiGrid({
  totals,
  periodLabel,
}: ErpAnalyticsKpiGridProps) {
  const scopeHint = periodLabel
    ? `Período: ${periodLabel}`
    : "Datos read-only desde REMITOS";

  const items: AnalyticsKpiItem[] = [
    {
      label: "Facturación total",
      value: formatAnalyticsCurrency(totals.facturacionTotal),
      hint: "Σ Total Final",
      icon: ShoppingBag,
      accent: "cyan",
    },
    {
      label: "Neto real MP",
      value: formatAnalyticsCurrency(totals.netoRealMp),
      hint: "Σ MP_NETO_REAL_ORDEN",
      icon: Wallet,
      accent: "emerald",
    },
    {
      label: "Costo total MP",
      value: formatAnalyticsCurrency(totals.costoTotalMp),
      hint: "Σ MP_TOTAL_COST_REAL",
      icon: TrendingDown,
      accent: "rose",
    },
    {
      label: "Fee MP",
      value: formatAnalyticsCurrency(totals.feeMp),
      hint: "Σ MP_FEE_TOTAL_REAL",
      icon: CreditCard,
      accent: "amber",
    },
    {
      label: "Platform fee",
      value: formatAnalyticsCurrency(totals.platformFee),
      hint: "Σ MP_PLATFORM_FEE_TOTAL_REAL",
      icon: DollarSign,
      accent: "violet",
    },
    {
      label: "Órdenes totales",
      value: formatAnalyticsCount(totals.ordenesTotales),
      hint: scopeHint,
      icon: Receipt,
      accent: "violet",
    },
    {
      label: "Órdenes con MP",
      value: formatAnalyticsCount(totals.ordenesConMp),
      hint: "MP_PAYMENT_ID o MP_STATUS",
      icon: CreditCard,
      accent: "emerald",
    },
    {
      label: "Órdenes sin MP",
      value: formatAnalyticsCount(totals.ordenesSinMp),
      hint: "Sin MP aplicado",
      icon: Receipt,
      accent: "amber",
    },
    {
      label: "Prendas vendidas",
      value: formatAnalyticsCount(totals.prendasVendidas),
      hint: "Σ Total De Prendas",
      icon: ShoppingBag,
      accent: "blue",
    },
    {
      label: "Ticket promedio",
      value: formatAnalyticsCurrency(totals.ticketPromedio),
      hint: "Facturación / órdenes",
      icon: TrendingUp,
      accent: "cyan",
    },
    {
      label: "Neto prom. por orden MP",
      value: formatAnalyticsCurrency(totals.netoPromedioPorOrden),
      hint: "Neto MP / órdenes con MP",
      icon: Wallet,
      accent: "emerald",
    },
    {
      label: "Costo MP % prom.",
      value: formatAnalyticsPercent(totals.costoMpPercentPromedio),
      hint: "Costo MP / Σ MP_TRANSACTION_AMOUNT",
      icon: Percent,
      accent: "rose",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {items.map((item) => (
        <AnalyticsKpiCard key={item.label} item={item} />
      ))}
    </div>
  );
}

function AnalyticsKpiCard({ item }: { item: AnalyticsKpiItem }) {
  const Icon = item.icon;

  return (
    <article
      className={cn(
        "erp-card erp-card-glow group relative p-4 transition-transform duration-200 hover:-translate-y-0.5 sm:p-5",
        ACCENT_CLASS[item.accent]
      )}
    >
      <div
        className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-20 blur-2xl transition-opacity group-hover:opacity-30"
        style={{ background: "hsl(var(--kpi-accent))" }}
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium uppercase tracking-wider text-[hsl(var(--erp-fg-muted))]">
            {item.label}
          </p>
          <p className="mt-2 break-words text-lg font-semibold tracking-tight text-[hsl(var(--erp-fg))] sm:text-xl">
            {item.value}
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

      <p className="relative mt-3 line-clamp-2 text-[10px] leading-relaxed text-[hsl(var(--erp-fg-muted))]">
        {item.hint}
      </p>
    </article>
  );
}
