import {
  CreditCard,
  Package,
  Receipt,
  ShoppingBag,
  type LucideIcon,
} from "lucide-react";

import {
  computeRemitosKpis,
  formatRemitosCount,
  formatRemitosCurrency,
} from "@/lib/erp/remitos-kpis";
import { cn } from "@/lib/utils";
import type { ErpRemito } from "@/types/erp";

type RemitosKpiItem = {
  label: string;
  value: string;
  hint: string;
  icon: LucideIcon;
  accent: "violet" | "cyan" | "emerald" | "amber";
};

const ACCENT_CLASS: Record<RemitosKpiItem["accent"], string> = {
  violet: "erp-kpi-accent-violet",
  cyan: "erp-kpi-accent-cyan",
  emerald: "erp-kpi-accent-emerald",
  amber: "erp-kpi-accent-amber",
};

type ErpRemitosKpiGridProps = {
  remitos: ErpRemito[];
  periodLabel?: string;
};

export function ErpRemitosKpiGrid({
  remitos,
  periodLabel,
}: ErpRemitosKpiGridProps) {
  const metrics = computeRemitosKpis(remitos);
  const scopeHint = periodLabel
    ? `Según filtros activos · ${periodLabel}`
    : "Según filtros activos";

  const items: RemitosKpiItem[] = [
    {
      label: "Total remitos",
      value: formatRemitosCount(metrics.totalRemitos),
      hint: scopeHint,
      icon: Receipt,
      accent: "violet",
    },
    {
      label: "Facturación total",
      value: formatRemitosCurrency(metrics.facturacionTotal),
      hint: "Suma de Total Final visible (sheet)",
      icon: ShoppingBag,
      accent: "cyan",
    },
    {
      label: "Prendas vendidas",
      value: formatRemitosCount(metrics.prendasVendidas),
      hint: "Suma de Total De Prendas visible",
      icon: Package,
      accent: "emerald",
    },
    {
      label: "Tickets con MP",
      value: formatRemitosCount(metrics.ticketsConMp),
      hint: "Con MP_PAYMENT_ID o MP_STATUS en sheet",
      icon: CreditCard,
      accent: "amber",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <RemitosKpiCard key={item.label} item={item} />
      ))}
    </div>
  );
}

function RemitosKpiCard({ item }: { item: RemitosKpiItem }) {
  const Icon = item.icon;

  return (
    <article
      className={cn(
        "erp-card erp-card-glow group relative p-5 transition-transform duration-200 hover:-translate-y-0.5",
        ACCENT_CLASS[item.accent]
      )}
    >
      <div
        className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-20 blur-2xl transition-opacity group-hover:opacity-30"
        style={{ background: "hsl(var(--kpi-accent))" }}
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wider text-[hsl(var(--erp-fg-muted))]">
            {item.label}
          </p>
          <p className="mt-2 break-words text-xl font-semibold tracking-tight text-[hsl(var(--erp-fg))] sm:text-[1.65rem]">
            {item.value}
          </p>
        </div>
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[hsl(var(--erp-border))]"
          style={{
            background: "hsl(var(--kpi-accent) / 0.12)",
            color: "hsl(var(--kpi-accent))",
          }}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>

      <p className="relative mt-4 line-clamp-2 text-[11px] leading-relaxed text-[hsl(var(--erp-fg-muted))]">
        {item.hint}
      </p>
    </article>
  );
}
