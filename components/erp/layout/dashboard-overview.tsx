import { KpiGrid } from "@/components/erp/cards/kpi-grid";
import { ActivityFeed } from "@/components/erp/tables/activity-feed";
import { RecentOrdersTable } from "@/components/erp/tables/recent-orders-table";
import type { ErpDashboardOverview } from "@/types/erp";

type DashboardOverviewProps = {
  data: ErpDashboardOverview;
};

export function DashboardOverview({ data }: DashboardOverviewProps) {
  const { resumen } = data;

  return (
    <div className="space-y-8 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[hsl(var(--erp-border))] bg-[hsl(var(--erp-bg-card))] px-3 py-1 text-[11px] font-medium text-[hsl(var(--erp-fg-muted))]">
            <span className="erp-live-dot h-1.5 w-1.5 rounded-full bg-[hsl(var(--erp-emerald))]" />
            Fase 1 · Datos mock
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-[hsl(var(--erp-fg))] sm:text-3xl">
            Overview
          </h1>
          <p className="mt-1 max-w-xl text-sm text-[hsl(var(--erp-fg-muted))]">
            Panel financiero-operativo para Tiendanube, Mercado Pago, Google
            Sheets y Apps Script.
          </p>
        </div>
        <p className="text-xs text-[hsl(var(--erp-fg-subtle))]">
          Actualizado{" "}
          {new Intl.DateTimeFormat("es-AR", {
            dateStyle: "medium",
            timeStyle: "short",
          }).format(new Date(data.actualizadoEn))}
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          {
            label: "Órdenes hoy",
            value: resumen.ordenesHoy,
            suffix: "",
          },
          {
            label: "Remitos abiertos",
            value: resumen.remitosAbiertos,
            suffix: "",
          },
          {
            label: "Alertas stock",
            value: resumen.alertasStock,
            suffix: "",
          },
          {
            label: "Conciliación MP",
            value: resumen.tasaConciliacion,
            suffix: "%",
          },
        ].map((stat, index) => (
          <div
            key={`${stat.label}-${index}`}
            className="erp-card flex flex-col justify-center px-4 py-3"
          >
            <span className="text-[10px] font-medium uppercase tracking-wider text-[hsl(var(--erp-fg-subtle))]">
              {stat.label}
            </span>
            <span className="mt-1 text-xl font-semibold tabular-nums text-[hsl(var(--erp-fg))]">
              {stat.value}
              {stat.suffix}
            </span>
          </div>
        ))}
      </div>

      <section aria-labelledby="kpi-heading">
        <h2 id="kpi-heading" className="sr-only">
          Indicadores clave
        </h2>
        <KpiGrid kpis={data.kpis} />
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <RecentOrdersTable orders={data.ordenesRecientes} />
        </div>
        <div className="xl:col-span-1">
          <ActivityFeed items={data.actividad} />
        </div>
      </section>

      <footer className="rounded-lg border border-dashed border-[hsl(var(--erp-border))] bg-[hsl(var(--erp-bg-card)/0.5)] px-4 py-3 text-center text-[11px] text-[hsl(var(--erp-fg-subtle))]">
        Integraciones activas en producción no modificadas. Próximas fases:
        conciliación MP, analytics y conexión API real.
      </footer>
    </div>
  );
}
