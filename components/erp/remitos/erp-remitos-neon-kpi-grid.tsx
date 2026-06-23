import {
  CreditCard,
  Layers,
  Package,
  Receipt,
  ShoppingBag,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

import { computeNeonLayeredKpis } from "@/lib/erp/v2/compute-neon-layered-kpis";
import {
  formatRemitosCount,
  formatRemitosCurrency,
} from "@/lib/erp/remitos-kpis";
import { cn } from "@/lib/utils";
import type { ErpRemitoDisplayRow } from "@/types/erp-remitos-display";

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

type ErpRemitosNeonKpiGridProps = {
  remitos: ErpRemitoDisplayRow[];
  periodLabel?: string;
};

export function ErpRemitosNeonKpiGrid({
  remitos,
  periodLabel,
}: ErpRemitosNeonKpiGridProps) {
  const kpis = computeNeonLayeredKpis(remitos);
  const scopeHint = periodLabel
    ? `Según filtros activos · ${periodLabel}`
    : "Según filtros activos";

  const commercialItems: KpiCardItem[] = [
    {
      label: "Ventas TN",
      value: formatRemitosCount(kpis.commercial.ventasTn),
      hint: `${scopeHint} · tn_created_at ART · tn_orders`,
      icon: Receipt,
      accent: "violet",
    },
    {
      label: "Facturación TN",
      value: formatRemitosCurrency(kpis.commercial.facturacionTn),
      hint: "Suma tn_total — verdad comercial Tiendanube",
      icon: ShoppingBag,
      accent: "cyan",
    },
    {
      label: "Ticket promedio TN",
      value: formatRemitosCurrency(kpis.commercial.ticketPromedioTn),
      hint: "tn_total ÷ ventas TN visibles",
      icon: TrendingUp,
      accent: "cyan",
    },
  ];

  const operationalItems: KpiCardItem[] = [
    {
      label: "Remitos ERP",
      value: formatRemitosCount(kpis.operational.remitosErp),
      hint: "Remitos vinculados · erp_orders.fecha_erp",
      icon: Layers,
      accent: "violet",
    },
    {
      label: "Prendas",
      value: formatRemitosCount(kpis.operational.prendas),
      hint: "Suma total_prendas · capa operativa ERP",
      icon: Package,
      accent: "emerald",
    },
    {
      label: "Tickets con MP",
      value: formatRemitosCount(kpis.operational.ticketsConMp),
      hint: "Remitos ERP con pago Mercado Pago aplicado",
      icon: CreditCard,
      accent: "amber",
    },
    {
      label: "Neto MP",
      value: kpis.operational.hasNetoMp
        ? formatRemitosCurrency(kpis.operational.netoMp)
        : "—",
      hint: kpis.operational.hasNetoMp
        ? "Suma neto_operativo en tickets con MP"
        : "Sin neto MP en remitos visibles",
      icon: CreditCard,
      accent: "amber",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-[hsl(var(--erp-accent)/0.35)] bg-[hsl(var(--erp-accent)/0.08)] px-4 py-3">
        <p className="text-center text-xs font-medium tracking-wide text-[hsl(var(--erp-fg))]">
          Comercial según Tiendanube / Operativo según ERP
        </p>
        <p className="mt-1 text-center text-[10px] text-[hsl(var(--erp-fg-muted))]">
          Las métricas comerciales usan tn_created_at; las operativas usan
          erp_orders — no se mezclan en un solo KPI.
        </p>
      </div>

      <section className="space-y-3">
        <header className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[hsl(var(--erp-cyan))]" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--erp-fg-muted))]">
            Comercial · Tiendanube
          </h2>
        </header>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {commercialItems.map((item) => (
            <NeonKpiCard key={item.label} item={item} />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <header className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[hsl(var(--erp-emerald))]" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--erp-fg-muted))]">
            Operativo · ERP
          </h2>
        </header>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {operationalItems.map((item) => (
            <NeonKpiCard key={item.label} item={item} />
          ))}
        </div>
      </section>
    </div>
  );
}

function NeonKpiCard({ item }: { item: KpiCardItem }) {
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
