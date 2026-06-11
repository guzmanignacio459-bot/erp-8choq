import { formatInstantArt } from "@/lib/erp/art-date";
import { formatRemitosCurrency } from "@/lib/erp/remitos-kpis";
import {
  commercialStatusLabel,
  reconciliationStatusLabel,
} from "@/lib/erp/v2/commercial-status-labels";
import { cn } from "@/lib/utils";
import type { TnCommercialStatus, V2CommercialOrder } from "@/types/erp-v2-api";

type TnOrdersTableProps = {
  orders: V2CommercialOrder[];
};

function truncateMiddle(value: string, head = 8, tail = 6): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

function CellText({
  value,
  mono = false,
}: {
  value: string | null | undefined;
  mono?: boolean;
}) {
  const text = value?.trim() || "—";
  if (text === "—") {
    return <span className="text-[hsl(var(--erp-fg-subtle))]">—</span>;
  }
  return (
    <span className={cn(mono && "font-mono text-[11px]")} title={text}>
      {text}
    </span>
  );
}

function CommercialStatusBadge({ status }: { status: TnCommercialStatus }) {
  const label = commercialStatusLabel(status);
  const tone =
    status === "activo"
      ? "border-[hsl(var(--erp-emerald)/0.45)] bg-[hsl(var(--erp-emerald)/0.12)] text-[hsl(var(--erp-emerald))]"
      : status === "cancelado" || status === "reembolsado"
        ? "border-[hsl(var(--erp-danger)/0.45)] bg-[hsl(var(--erp-danger)/0.12)] text-[hsl(var(--erp-danger))]"
        : "border-[hsl(var(--erp-border))] bg-[hsl(var(--erp-bg-hover))] text-[hsl(var(--erp-fg-muted))]";

  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium",
        tone
      )}
    >
      {label}
    </span>
  );
}

function ErpLinkBadge({ erpOrderId }: { erpOrderId: string }) {
  return (
    <span
      className="inline-flex max-w-[120px] truncate rounded border border-[hsl(var(--erp-border))] bg-[hsl(var(--erp-bg-hover))] px-1.5 py-0.5 font-mono text-[10px] text-[hsl(var(--erp-fg-muted))]"
      title={erpOrderId}
    >
      {erpOrderId}
    </span>
  );
}

export function TnOrdersTable({ orders }: TnOrdersTableProps) {
  if (orders.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-[hsl(var(--erp-fg-muted))]">
        Sin órdenes para los filtros activos.
      </p>
    );
  }

  return (
    <div className="min-w-0 overflow-x-auto">
      <table className="w-full min-w-[960px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-[hsl(var(--erp-border))] text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--erp-fg-subtle))]">
            <th className="px-3 py-3">Orden TN</th>
            <th className="px-3 py-3">Fecha TN</th>
            <th className="px-3 py-3">Cliente</th>
            <th className="px-3 py-3 text-right">Total</th>
            <th className="px-3 py-3">Estado</th>
            <th className="px-3 py-3">Pago</th>
            <th className="px-3 py-3">Envío</th>
            <th className="px-3 py-3">ERP</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => {
            const fecha = order.tnCreatedAt
              ? formatInstantArt(order.tnCreatedAt)
              : "—";
            const pago =
              [order.paymentMethod, order.paymentGateway]
                .filter(Boolean)
                .join(" · ") || null;

            return (
              <tr
                key={order.tnOrderId}
                className="border-b border-[hsl(var(--erp-border-subtle))] transition-colors hover:bg-[hsl(var(--erp-bg-hover)/0.5)]"
              >
                <td className="px-3 py-2.5">
                  <span
                    className="font-mono text-[11px] text-[hsl(var(--erp-cyan))]"
                    title={order.tnOrderId}
                  >
                    {truncateMiddle(order.tnOrderId)}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-[hsl(var(--erp-fg-muted))]">
                  {fecha}
                </td>
                <td className="max-w-[180px] px-3 py-2.5">
                  <div className="truncate font-medium text-[hsl(var(--erp-fg))]">
                    <CellText value={order.customerName} />
                  </div>
                  {order.provinceLocalidad ? (
                    <div className="truncate text-[10px] text-[hsl(var(--erp-fg-subtle))]">
                      {order.provinceLocalidad}
                    </div>
                  ) : null}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums font-medium text-[hsl(var(--erp-fg))]">
                  {formatRemitosCurrency(order.tnTotal)}
                </td>
                <td className="px-3 py-2.5">
                  <CommercialStatusBadge status={order.commercialStatus} />
                </td>
                <td className="max-w-[140px] px-3 py-2.5">
                  <CellText value={pago} />
                </td>
                <td className="max-w-[140px] px-3 py-2.5">
                  <CellText value={order.shippingOption} />
                </td>
                <td className="px-3 py-2.5">
                  {order.erp?.erpOrderId ? (
                    <div className="space-y-1">
                      <ErpLinkBadge erpOrderId={order.erp.erpOrderId} />
                      {order.erp.reconciliationStatus ? (
                        <p className="text-[9px] text-[hsl(var(--erp-fg-subtle))]">
                          {reconciliationStatusLabel(
                            order.erp.reconciliationStatus
                          )}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <span className="text-[10px] text-[hsl(var(--erp-fg-subtle))]">
                      —
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
