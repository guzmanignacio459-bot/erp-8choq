import type { ErpRecentOrder } from "@/types/erp";

const CANAL_STYLES: Record<ErpRecentOrder["canal"], string> = {
  Tiendanube: "bg-violet-500/15 text-violet-300 border-violet-500/25",
  "Mercado Pago": "bg-sky-500/15 text-sky-300 border-sky-500/25",
  Manual: "bg-amber-500/15 text-amber-300 border-amber-500/25",
};

const ESTADO_STYLES: Record<ErpRecentOrder["estado"], string> = {
  Pagado: "text-[hsl(var(--erp-emerald))]",
  Pendiente: "text-[hsl(38_92%_50%)]",
  Importado: "text-[hsl(var(--erp-cyan))]",
  Conciliado: "text-[hsl(var(--erp-accent))]",
};

function formatMoney(n: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("es-AR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

type RecentOrdersTableProps = {
  orders: ErpRecentOrder[];
};

export function RecentOrdersTable({ orders }: RecentOrdersTableProps) {
  return (
    <div className="erp-card overflow-hidden">
      <div className="border-b border-[hsl(var(--erp-border-subtle))] px-5 py-4">
        <h2 className="text-sm font-semibold text-[hsl(var(--erp-fg))]">
          Órdenes recientes
        </h2>
        <p className="mt-0.5 text-xs text-[hsl(var(--erp-fg-muted))]">
          Vista consolidada · datos de demostración
        </p>
      </div>
      <div className="erp-scrollbar overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-[hsl(var(--erp-border-subtle))] text-left text-[11px] font-medium uppercase tracking-wider text-[hsl(var(--erp-fg-subtle))]">
              <th className="px-5 py-3">ID</th>
              <th className="px-5 py-3">Canal</th>
              <th className="px-5 py-3">Cliente</th>
              <th className="px-5 py-3 text-right">Monto</th>
              <th className="px-5 py-3">Estado</th>
              <th className="px-5 py-3">Fecha</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order, index) => (
              <tr
                key={`${order.id}-${index}`}
                className="border-b border-[hsl(var(--erp-border-subtle))] last:border-0 transition-colors hover:bg-[hsl(var(--erp-bg-hover)/0.5)]"
              >
                <td className="px-5 py-3.5 font-mono text-xs text-[hsl(var(--erp-fg))]">
                  {order.id}
                </td>
                <td className="px-5 py-3.5">
                  <span
                    className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium ${CANAL_STYLES[order.canal]}`}
                  >
                    {order.canal}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-[hsl(var(--erp-fg-muted))]">
                  {order.cliente}
                </td>
                <td className="px-5 py-3.5 text-right font-medium tabular-nums text-[hsl(var(--erp-fg))]">
                  {formatMoney(order.monto)}
                </td>
                <td
                  className={`px-5 py-3.5 text-xs font-medium ${ESTADO_STYLES[order.estado]}`}
                >
                  {order.estado}
                </td>
                <td className="px-5 py-3.5 text-xs text-[hsl(var(--erp-fg-subtle))]">
                  {formatDate(order.fecha)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
