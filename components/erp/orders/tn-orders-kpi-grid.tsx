import { Layers, Receipt, ShoppingBag, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { computeTnOrdersKpis } from "@/lib/erp/v2/compute-tn-orders-kpis";
import {
  formatRemitosCount,
  formatRemitosCurrency,
} from "@/lib/erp/remitos-kpis";
import { cn } from "@/lib/utils";
import type { V2CommercialOrder } from "@/types/erp-v2-api";

type KpiCardItem = {
  label: string;
  value: string;
  hint: string;
  icon: LucideIcon;
  accent: "violet" | "cyan" | "emerald" | "amber";
};

const ACCENT_CLASS: Record<KpiCardItem["accent"], string> = {
  violet: "erp-kpi-accent-violet",
  cyan: "erp-kpi-accent-cyan",
  emerald: "erp-kpi-accent-emerald",
  amber: "erp-kpi-accent-amber",
};

type TnOrdersKpiGridProps = {
  orders: V2CommercialOrder[];
  periodLabel?: string;
  serverKpi?: {
    ordersInRange: number;
    facturacionTotal: number;
  };
};

export function TnOrdersKpiGrid({
  orders,
  periodLabel,
  serverKpi,
}: TnOrdersKpiGridProps) {
  const kpis = computeTnOrdersKpis(orders);
  const scopeHint = periodLabel
    ? `Según filtros activos · ${periodLabel}`
    : "Según filtros activos";

  const ventas =
    serverKpi?.ordersInRange != null ? serverKpi.ordersInRange : kpis.ventasTn;
  const facturacion =
    serverKpi?.facturacionTotal != null
      ? serverKpi.facturacionTotal
      : kpis.facturacionTn;
  const ticket = ventas > 0 ? facturacion / ventas : 0;

  const items: KpiCardItem[] = [
    {
      label: "Ventas TN",
      value: formatRemitosCount(ventas),
      hint: `${scopeHint} · tn_created_at ART`,
      icon: Receipt,
      accent: "violet",
    },
    {
      label: "Facturación TN",
      value: formatRemitosCurrency(facturacion),
      hint: "Suma tn_total — verdad comercial Tiendanube",
      icon: ShoppingBag,
      accent: "cyan",
    },
    {
      label: "Ticket promedio TN",
      value: formatRemitosCurrency(ticket),
      hint: "tn_total ÷ ventas visibles",
      icon: TrendingUp,
      accent: "cyan",
    },
    {
      label: "Con remito ERP",
      value: formatRemitosCount(kpis.conRemitoErp),
      hint: "Enriquecimiento opcional · no KPI de negocio ecommerce",
      icon: Layers,
      accent: "emerald",
    },
  ];

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-[hsl(var(--erp-accent)/0.35)] bg-[hsl(var(--erp-accent)/0.08)] px-4 py-3">
        <p className="text-center text-xs font-medium tracking-wide text-[hsl(var(--erp-fg))]">
          KPIs comerciales · Tiendanube (tn_orders)
        </p>
        <p className="mt-1 text-center text-[10px] text-[hsl(var(--erp-fg-muted))]">
          Sin mezclar fecha_erp ni netos operativos ERP en métricas de venta.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => (
          <TnKpiCard key={item.label} item={item} />
        ))}
      </div>
    </div>
  );
}

function TnKpiCard({ item }: { item: KpiCardItem }) {
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
