"use client";

import { Megaphone } from "lucide-react";

import type { ErpAnalyticsMetaPlaceholder } from "@/types/erp";

const META_METRIC_LABELS: Record<
  ErpAnalyticsMetaPlaceholder["plannedMetrics"][number],
  string
> = {
  spend: "Gasto Meta",
  mer: "MER",
  roas: "ROAS",
  cpa: "CPA",
  cac: "CAC",
  contribucionNeta: "Contribución neta",
};

type ErpAnalyticsMetaSlotProps = {
  meta: ErpAnalyticsMetaPlaceholder;
};

export function ErpAnalyticsMetaSlot({ meta }: ErpAnalyticsMetaSlotProps) {
  return (
    <section className="erp-card border-dashed border-[hsl(var(--erp-border))] p-4 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-blue-500/30 bg-blue-500/10 text-blue-300">
            <Megaphone className="h-5 w-5" />
          </div>
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-[hsl(var(--erp-fg))]">
                Meta Ads
              </h2>
              <span className="inline-flex rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-medium text-amber-200">
                Próximamente · Fase 3.2
              </span>
            </div>
            <p className="max-w-xl text-xs leading-relaxed text-[hsl(var(--erp-fg-muted))]">
              Espacio reservado para métricas de adquisición. Sin conexión a Meta
              todavía — no afecta datos actuales de REMITOS ni Mercado Pago.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {meta.plannedMetrics.map((key) => (
          <div
            key={key}
            className="rounded-lg border border-[hsl(var(--erp-border-subtle))] bg-[hsl(var(--erp-bg-hover)/0.35)] px-3 py-4 text-center opacity-60"
          >
            <p className="text-[10px] font-medium uppercase tracking-wider text-[hsl(var(--erp-fg-subtle))]">
              {META_METRIC_LABELS[key]}
            </p>
            <p className="mt-2 text-sm font-medium text-[hsl(var(--erp-fg-muted))]">
              —
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
