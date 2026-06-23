"use client";

import { PackageSearch } from "lucide-react";

import { formatAnalyticsCount } from "@/lib/erp/analytics-format";
import type { ErpAnalyticsTopProductsSection } from "@/types/erp";

type ErpAnalyticsTopProductsProps = {
  section: ErpAnalyticsTopProductsSection;
};

export function ErpAnalyticsTopProducts({
  section,
}: ErpAnalyticsTopProductsProps) {
  if (!section.available || section.items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-[hsl(var(--erp-border))] bg-[hsl(var(--erp-bg-hover)/0.25)] px-6 py-10 text-center">
        <PackageSearch className="h-8 w-8 text-[hsl(var(--erp-fg-subtle))]" />
        <div>
          <p className="text-sm font-medium text-[hsl(var(--erp-fg))]">
            No disponible
          </p>
          <p className="mt-1 max-w-md text-xs text-[hsl(var(--erp-fg-muted))]">
            {section.unavailableReason ??
              "Top productos requiere REMITO_ITEMS vía getAnalyticsSummary (GAS)."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-[hsl(var(--erp-border-subtle))]">
      <table className="w-full min-w-[480px] text-left text-sm">
        <thead>
          <tr className="border-b border-[hsl(var(--erp-border-subtle))] bg-[hsl(var(--erp-bg-hover)/0.5)]">
            <th className="px-4 py-3 text-[10px] font-medium uppercase tracking-wider text-[hsl(var(--erp-fg-subtle))]">
              #
            </th>
            <th className="px-4 py-3 text-[10px] font-medium uppercase tracking-wider text-[hsl(var(--erp-fg-subtle))]">
              SKU
            </th>
            <th className="px-4 py-3 text-[10px] font-medium uppercase tracking-wider text-[hsl(var(--erp-fg-subtle))]">
              Artículo
            </th>
            <th className="px-4 py-3 text-right text-[10px] font-medium uppercase tracking-wider text-[hsl(var(--erp-fg-subtle))]">
              Unidades
            </th>
          </tr>
        </thead>
        <tbody>
          {section.items.map((row, index) => (
            <tr
              key={`${row.sku}-${index}`}
              className="border-b border-[hsl(var(--erp-border-subtle))] last:border-0 hover:bg-[hsl(var(--erp-bg-hover)/0.35)]"
            >
              <td className="px-4 py-3 tabular-nums text-[hsl(var(--erp-fg-muted))]">
                {index + 1}
              </td>
              <td className="px-4 py-3 font-mono text-xs text-[hsl(var(--erp-fg))]">
                {row.sku || "—"}
              </td>
              <td className="px-4 py-3 text-[hsl(var(--erp-fg))]">
                {row.articulo || "—"}
              </td>
              <td className="px-4 py-3 text-right tabular-nums font-medium text-[hsl(var(--erp-fg))]">
                {formatAnalyticsCount(row.unidades)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
