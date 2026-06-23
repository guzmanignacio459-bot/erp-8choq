import { formatRemitoFechaDisplay } from "@/lib/erp/remitos-mapper";
import { formatRemitosCurrency } from "@/lib/erp/remitos-kpis";
import type { V2FinancialItemRow } from "@/types/erp-v2-financial-items";

type Props = {
  items: V2FinancialItemRow[];
};

export function ErpFinancialItemsTable({ items }: Props) {
  if (items.length === 0) {
    return (
      <p className="p-6 text-center text-sm text-[hsl(var(--erp-fg-muted))]">
        Sin financial items en el rango seleccionado.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[960px] text-left text-sm">
        <thead>
          <tr className="border-b border-[hsl(var(--erp-border))] text-[11px] uppercase tracking-wide text-[hsl(var(--erp-fg-subtle))]">
            <th className="px-3 py-2">Fecha</th>
            <th className="px-3 py-2">SKU</th>
            <th className="px-3 py-2">Producto</th>
            <th className="px-3 py-2">Cliente</th>
            <th className="px-3 py-2 text-right">Bruto</th>
            <th className="px-3 py-2 text-right">Descuento</th>
            <th className="px-3 py-2 text-right">Fee TN</th>
            <th className="px-3 py-2 text-right">Fee MP</th>
            <th className="px-3 py-2 text-right">Neto</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr
              key={row.id}
              className="border-b border-[hsl(var(--erp-border-subtle))] last:border-0 hover:bg-[hsl(var(--erp-bg-hover)/0.35)]"
            >
              <td className="whitespace-nowrap px-3 py-2 text-[hsl(var(--erp-fg-muted))]">
                {formatRemitoFechaDisplay(row.date.slice(0, 10)) || row.date.slice(0, 10)}
              </td>
              <td className="px-3 py-2 font-mono text-xs">{row.sku || "—"}</td>
              <td className="max-w-[200px] truncate px-3 py-2">{row.productName || "—"}</td>
              <td className="max-w-[160px] truncate px-3 py-2">{row.customerName || "—"}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {formatRemitosCurrency(row.grossAmount)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {formatRemitosCurrency(row.discountAllocated)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {formatRemitosCurrency(row.tnFeeAllocated)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {formatRemitosCurrency(row.mpFeeAllocated)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums font-medium">
                {formatRemitosCurrency(row.netAmount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
