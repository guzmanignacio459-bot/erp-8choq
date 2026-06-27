import { Layers, MapPin, Percent, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { formatRemitosCount } from "@/lib/erp/remitos-kpis";
import { cn } from "@/lib/utils";
import type { V2FinancialAccountsKpi } from "@/types/erp-v2-financial-accounts";

type KpiCard = {
  label: string;
  value: string;
  sub?: string;
  icon: LucideIcon;
  accent: "violet" | "cyan" | "emerald" | "amber";
};

const ACCENT: Record<KpiCard["accent"], string> = {
  violet: "erp-kpi-accent-violet",
  cyan: "erp-kpi-accent-cyan",
  emerald: "erp-kpi-accent-emerald",
  amber: "erp-kpi-accent-amber",
};

type Props = {
  kpi: V2FinancialAccountsKpi;
};

export function ErpFinancialAccountsKpiGrid({ kpi }: Props) {
  const dest = kpi.currentDestination;

  const cards: KpiCard[] = [
    {
      label: "Cuenta Destino Actual",
      value: dest?.name ?? "—",
      sub: dest != null ? `${dest.ratePercent.toFixed(2)}%` : undefined,
      icon: MapPin,
      accent: "emerald",
    },
    {
      label: "Total cuentas",
      value: formatRemitosCount(kpi.totalCount),
      icon: Wallet,
      accent: "violet",
    },
    {
      label: "Tasa destino",
      value: dest != null ? `${dest.ratePercent.toFixed(2)}%` : "—",
      icon: Percent,
      accent: "cyan",
    },
    {
      label: "Cuentas 0%",
      value: formatRemitosCount(kpi.zeroRateCount),
      icon: Layers,
      accent: "amber",
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
              {card.sub && (
                <p className="mt-0.5 text-sm tabular-nums text-[hsl(var(--erp-fg-muted))]">
                  {card.sub}
                </p>
              )}
            </div>
            <card.icon className="h-4 w-4 shrink-0 opacity-70" />
          </div>
        </div>
      ))}
    </div>
  );
}
