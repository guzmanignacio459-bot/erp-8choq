import { Building2, CheckCircle2, Clock, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { formatRemitosCount } from "@/lib/erp/remitos-kpis";
import { cn } from "@/lib/utils";
import type { V2TransferAssignmentKpi } from "@/types/erp-v2-financial-account-assignments";

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
  kpi: V2TransferAssignmentKpi;
};

export function ErpFinancialAccountsAssignmentKpiGrid({ kpi }: Props) {
  const cards: KpiCard[] = [
    {
      label: "Transferencias asignadas",
      value: formatRemitosCount(kpi.transferAssigned),
      icon: CheckCircle2,
      accent: "emerald",
    },
    {
      label: "Transferencias sin asignar",
      value: formatRemitosCount(kpi.transferUnassigned),
      icon: kpi.transferUnassigned > 0 ? XCircle : CheckCircle2,
      accent: kpi.transferUnassigned > 0 ? "rose" : "emerald",
    },
    {
      label: "Cuenta activa",
      value: kpi.activeAccountName ?? "—",
      icon: Building2,
      accent: "violet",
    },
    {
      label: "Total transferencias",
      value: formatRemitosCount(kpi.transferOrdersTotal),
      icon: Clock,
      accent: "cyan",
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
              <p className="mt-1 text-lg font-semibold tabular-nums text-[hsl(var(--erp-fg))]">
                {card.value}
              </p>
            </div>
            <card.icon className="h-4 w-4 shrink-0 opacity-70" />
          </div>
        </div>
      ))}
    </div>
  );
}
