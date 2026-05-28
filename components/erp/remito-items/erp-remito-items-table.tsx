"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";

import { ErpRemitoItemsOwnerBadge } from "@/components/erp/remito-items/erp-remito-items-owner-badge";
import { displayMpFeeReal } from "@/lib/erp/remito-items-mapper";
import { formatAnalyticsCurrency } from "@/lib/erp/analytics-format";
import { cn } from "@/lib/utils";
import type { ErpRemitoItemRow } from "@/types/erp";

type ErpRemitoItemsTableProps = {
  items: ErpRemitoItemRow[];
};

function Amount({ value }: { value: number }) {
  return (
    <span className="whitespace-nowrap tabular-nums text-[hsl(var(--erp-fg-muted))]">
      {formatAnalyticsCurrency(value)}
    </span>
  );
}

function MobileCard({ row }: { row: ErpRemitoItemRow }) {
  const mpFee = displayMpFeeReal(row);

  return (
    <article className="rounded-lg border border-[hsl(var(--erp-border-subtle))] bg-[hsl(var(--erp-bg-hover)/0.25)] p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[11px] text-[hsl(var(--erp-cyan))]">
            {row.sku || "—"}
          </p>
          <p className="text-sm font-medium text-[hsl(var(--erp-fg))]">
            {row.articulo || "—"}
          </p>
          <p className="text-xs text-[hsl(var(--erp-fg-muted))]">
            Talle {row.talle || "—"}
          </p>
        </div>
        <ErpRemitoItemsOwnerBadge owner={row.owner} />
      </div>

      <div className="flex flex-wrap gap-2 text-[11px] text-[hsl(var(--erp-fg-muted))]">
        <span>{row.fechaDisplay}</span>
        <Link
          href={`/dashboard/remitos/${encodeURIComponent(row.idRemito)}`}
          className="inline-flex items-center gap-1 text-[hsl(var(--erp-accent))] hover:underline"
        >
          #{row.idRemito}
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div>
          <p className="text-[10px] uppercase text-[hsl(var(--erp-fg-subtle))]">
            Precio
          </p>
          <Amount value={row.precioUnitario} />
        </div>
        <div>
          <p className="text-[10px] uppercase text-[hsl(var(--erp-fg-subtle))]">
            Neto
          </p>
          <Amount value={row.netoDisplay} />
        </div>
        <div>
          <p className="text-[10px] uppercase text-[hsl(var(--erp-fg-subtle))]">
            Desc.
          </p>
          <Amount value={row.descuentoAsignado} />
        </div>
        <div>
          <p className="text-[10px] uppercase text-[hsl(var(--erp-fg-subtle))]">
            Ship.
          </p>
          <Amount value={row.shippingAsignado} />
        </div>
        <div>
          <p className="text-[10px] uppercase text-[hsl(var(--erp-fg-subtle))]">
            Fee
          </p>
          <Amount value={row.feeAsignado} />
        </div>
        <div>
          <p className="text-[10px] uppercase text-[hsl(var(--erp-fg-subtle))]">
            MP fee real
          </p>
          <Amount value={mpFee} />
        </div>
      </div>
    </article>
  );
}

export function ErpRemitoItemsTable({ items }: ErpRemitoItemsTableProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[hsl(var(--erp-border))] px-6 py-12 text-center">
        <p className="text-sm text-[hsl(var(--erp-fg-muted))]">
          No hay ítems para los filtros seleccionados.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3 md:hidden">
        {items.map((row) => (
          <MobileCard key={row.rowId} row={row} />
        ))}
      </div>

      <div className="hidden md:block overflow-x-auto rounded-lg border border-[hsl(var(--erp-border-subtle))]">
        <table className="w-full min-w-[1100px] text-left text-xs">
          <thead>
            <tr className="border-b border-[hsl(var(--erp-border-subtle))] bg-[hsl(var(--erp-bg-hover)/0.5)] text-[10px] uppercase tracking-wider text-[hsl(var(--erp-fg-subtle))]">
              {[
                "Fecha",
                "ID Remito",
                "SKU",
                "Artículo",
                "Talle",
                "Owner",
                "Precio",
                "Desc.",
                "Ship.",
                "Fee",
                "Neto",
                "MP fee real",
              ].map((h) => (
                <th key={h} className="px-3 py-2.5 font-medium whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((row) => {
              const mpFee = displayMpFeeReal(row);
              return (
                <tr
                  key={row.rowId}
                  className="border-b border-[hsl(var(--erp-border-subtle))] last:border-0 hover:bg-[hsl(var(--erp-bg-hover)/0.35)]"
                >
                  <td className="px-3 py-2.5 whitespace-nowrap text-[hsl(var(--erp-fg-muted))]">
                    {row.fechaDisplay}
                  </td>
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/dashboard/remitos/${encodeURIComponent(row.idRemito)}`}
                      className={cn(
                        "inline-flex items-center gap-1 font-mono text-[11px] text-[hsl(var(--erp-accent))] hover:underline"
                      )}
                    >
                      {row.idRemito}
                      <ExternalLink className="h-3 w-3 opacity-60" />
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[11px] text-[hsl(var(--erp-cyan))]">
                    {row.sku || "—"}
                  </td>
                  <td className="max-w-[160px] truncate px-3 py-2.5" title={row.articulo}>
                    {row.articulo || "—"}
                  </td>
                  <td className="px-3 py-2.5">{row.talle || "—"}</td>
                  <td className="px-3 py-2.5">
                    <ErpRemitoItemsOwnerBadge owner={row.owner} />
                  </td>
                  <td className="px-3 py-2.5">
                    <Amount value={row.precioUnitario} />
                  </td>
                  <td className="px-3 py-2.5">
                    <Amount value={row.descuentoAsignado} />
                  </td>
                  <td className="px-3 py-2.5">
                    <Amount value={row.shippingAsignado} />
                  </td>
                  <td className="px-3 py-2.5">
                    <Amount value={row.feeAsignado} />
                  </td>
                  <td className="px-3 py-2.5 font-medium text-[hsl(var(--erp-fg))]">
                    <Amount value={row.netoDisplay} />
                  </td>
                  <td className="px-3 py-2.5">
                    <Amount value={mpFee} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
