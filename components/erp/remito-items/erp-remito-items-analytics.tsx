"use client";

import { BarChart3 } from "lucide-react";

import {
  formatAnalyticsCount,
  formatAnalyticsCurrency,
} from "@/lib/erp/analytics-format";
import type { ErpRemitoItemsProductAnalytics } from "@/types/erp";

type ErpRemitoItemsAnalyticsProps = {
  analytics: ErpRemitoItemsProductAnalytics;
};

function MiniRankList({
  title,
  rows,
  valueKey,
  labelKey,
}: {
  title: string;
  rows: Record<string, string | number>[];
  labelKey: string;
  valueKey: string;
}) {
  return (
    <div className="rounded-lg border border-[hsl(var(--erp-border-subtle))] bg-[hsl(var(--erp-bg-hover)/0.25)] p-3">
      <h3 className="mb-3 text-xs font-semibold text-[hsl(var(--erp-fg))]">
        {title}
      </h3>
      {rows.length === 0 ? (
        <p className="text-xs text-[hsl(var(--erp-fg-muted))]">Sin datos</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row, i) => (
            <li
              key={`${title}-${i}-${String(row[labelKey])}`}
              className="flex items-start justify-between gap-2 text-xs"
            >
              <span
                className="min-w-0 flex-1 truncate text-[hsl(var(--erp-fg-muted))]"
                title={String(row[labelKey])}
              >
                {i + 1}. {String(row[labelKey])}
              </span>
              <span className="shrink-0 tabular-nums text-[hsl(var(--erp-fg))]">
                {valueKey === "neto"
                  ? formatAnalyticsCurrency(Number(row[valueKey]))
                  : formatAnalyticsCount(Number(row[valueKey]))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ErpRemitoItemsAnalytics({
  analytics,
}: ErpRemitoItemsAnalyticsProps) {
  return (
    <section className="erp-card p-4 sm:p-5">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[hsl(var(--erp-border))] bg-[hsl(var(--erp-bg-hover))] text-[hsl(var(--erp-accent))]">
          <BarChart3 className="h-4 w-4" />
        </div>
        <h2 className="text-sm font-semibold text-[hsl(var(--erp-fg))]">
          Analytics de productos
        </h2>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <MiniRankList
          title="Top SKU (unidades)"
          rows={analytics.topSku.map((r) => ({
            label: r.sku,
            value: r.unidades,
          }))}
          labelKey="label"
          valueKey="value"
        />
        <MiniRankList
          title="Top artículo (unidades)"
          rows={analytics.topArticulo.map((r) => ({
            label: r.articulo,
            value: r.unidades,
          }))}
          labelKey="label"
          valueKey="value"
        />
        <MiniRankList
          title="Ventas por talle"
          rows={analytics.ventasPorTalle.map((r) => ({
            label: r.talle,
            value: r.unidades,
          }))}
          labelKey="label"
          valueKey="value"
        />
        <MiniRankList
          title="Neto por owner"
          rows={analytics.netoPorOwner.map((r) => ({
            label: r.owner,
            value: r.neto,
          }))}
          labelKey="label"
          valueKey="neto"
        />
        <MiniRankList
          title="Neto por producto"
          rows={analytics.netoPorProducto.map((r) => ({
            label: `${r.sku} · ${r.articulo}`,
            value: r.neto,
          }))}
          labelKey="label"
          valueKey="neto"
        />
      </div>
    </section>
  );
}
