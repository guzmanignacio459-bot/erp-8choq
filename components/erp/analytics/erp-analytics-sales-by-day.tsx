"use client";

import {
  formatAnalyticsCount,
  formatAnalyticsCurrency,
  formatAnalyticsDayLabel,
} from "@/lib/erp/analytics-format";
import type { ErpAnalyticsDaySale } from "@/types/erp";

type ErpAnalyticsSalesByDayProps = {
  salesByDay: ErpAnalyticsDaySale[];
};

export function ErpAnalyticsSalesByDay({
  salesByDay,
}: ErpAnalyticsSalesByDayProps) {
  if (salesByDay.length === 0) {
    return (
      <p className="text-sm text-[hsl(var(--erp-fg-muted))]">
        No hay ventas en el período seleccionado.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-[hsl(var(--erp-border-subtle))]">
      <table className="w-full min-w-[480px] text-left text-sm">
        <thead>
          <tr className="border-b border-[hsl(var(--erp-border-subtle))] bg-[hsl(var(--erp-bg-hover)/0.5)]">
            <th className="px-4 py-3 text-[10px] font-medium uppercase tracking-wider text-[hsl(var(--erp-fg-subtle))]">
              Día
            </th>
            <th className="px-4 py-3 text-right text-[10px] font-medium uppercase tracking-wider text-[hsl(var(--erp-fg-subtle))]">
              Órdenes
            </th>
            <th className="px-4 py-3 text-right text-[10px] font-medium uppercase tracking-wider text-[hsl(var(--erp-fg-subtle))]">
              Facturación
            </th>
          </tr>
        </thead>
        <tbody>
          {salesByDay.map((row) => (
            <tr
              key={row.date}
              className="border-b border-[hsl(var(--erp-border-subtle))] last:border-0 hover:bg-[hsl(var(--erp-bg-hover)/0.35)]"
            >
              <td className="px-4 py-3 text-[hsl(var(--erp-fg))]">
                {formatAnalyticsDayLabel(row.date)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-[hsl(var(--erp-fg-muted))]">
                {formatAnalyticsCount(row.ordenes)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums font-medium text-[hsl(var(--erp-fg))]">
                {formatAnalyticsCurrency(row.facturacion)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
