import Link from "next/link";
import { ExternalLink } from "lucide-react";

import { formatRemitosCurrency, parseRemitoAmount } from "@/lib/erp/remitos-kpis";
import {
  resolvePagoEnvioLabel,
  type PagoEnvioLabel,
} from "@/lib/erp/remitos-shipping-display";
import { cn } from "@/lib/utils";
import { ErpRemitosReconciliationBadge } from "@/components/erp/remitos/erp-remitos-reconciliation-badge";
import type { ErpRemitoDisplayRow } from "@/types/erp-remitos-display";

type ErpRemitosTableProps = {
  remitos: ErpRemitoDisplayRow[];
  showNeonMeta?: boolean;
};

function formatAmountDisplay(value: string): string {
  const trimmed = value?.trim();
  if (!trimmed) return "—";
  const amount = parseRemitoAmount(trimmed);
  if (amount !== 0) return formatRemitosCurrency(amount);
  return trimmed;
}

function truncateMiddle(value: string, head = 8, tail = 6): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

function CellText({
  value,
  className = "",
  mono = false,
}: {
  value: string;
  className?: string;
  mono?: boolean;
}) {
  const text = value?.trim() || "—";
  if (text === "—") {
    return <span className="text-[hsl(var(--erp-fg-subtle))]">—</span>;
  }
  return (
    <span
      className={cn(mono && "font-mono", className)}
      title={text.length > 28 ? text : undefined}
    >
      {text}
    </span>
  );
}

function AmountCell({ value }: { value: string }) {
  return (
    <span className="whitespace-nowrap tabular-nums text-[hsl(var(--erp-fg-muted))]">
      {formatAmountDisplay(value)}
    </span>
  );
}

function LongMonoCell({ value }: { value: string }) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return <span className="text-[hsl(var(--erp-fg-subtle))]">—</span>;
  }
  const display =
    trimmed.length > 14 ? truncateMiddle(trimmed, 6, 4) : trimmed;
  return (
    <span
      className="inline-block max-w-full truncate font-mono text-[11px] text-[hsl(var(--erp-cyan))]"
      title={trimmed}
    >
      {display}
    </span>
  );
}

function PagoEnvioBadge({ label }: { label: PagoEnvioLabel }) {
  let className =
    "inline-flex max-w-full truncate rounded-md border px-2 py-0.5 text-[10px] font-medium ";

  if (label === "Cliente") {
    className += "border-cyan-500/30 bg-cyan-500/10 text-cyan-200";
  } else if (label === "8Q") {
    className += "border-violet-500/30 bg-violet-500/10 text-violet-200";
  } else {
    className +=
      "border-[hsl(var(--erp-border))] bg-[hsl(var(--erp-bg-hover))] text-[hsl(var(--erp-fg-subtle))]";
  }

  return (
    <span className={className} title={label}>
      {label}
    </span>
  );
}

type DesktopColumn = {
  key: string;
  label: string;
  minW: string;
  align?: "right";
  render: (remito: ErpRemitoDisplayRow) => React.ReactNode;
};

const DESKTOP_COLUMNS: DesktopColumn[] = [
  {
    key: "id",
    label: "ID Remito",
    minW: "min-w-[168px]",
    render: (r) => (
      <span className="font-mono text-xs tracking-tight" title={r.idRemito}>
        {r.idRemito}
      </span>
    ),
  },
  {
    key: "fecha",
    label: "Fecha",
    minW: "min-w-[130px]",
    render: (r) => (
      <span className="text-xs tabular-nums text-[hsl(var(--erp-fg-muted))]">
        {r.fechaDisplay || "—"}
      </span>
    ),
  },
  {
    key: "nombre",
    label: "Nombre",
    minW: "min-w-[160px]",
    render: (r) => (
      <CellText value={r.nombre} className="block max-w-[180px] truncate" />
    ),
  },
  {
    key: "dni",
    label: "DNI",
    minW: "min-w-[100px]",
    render: (r) => (
      <CellText value={r.dni} mono className="text-xs tabular-nums" />
    ),
  },
  {
    key: "provincia",
    label: "Provincia/Localidad",
    minW: "min-w-[150px]",
    render: (r) => (
      <CellText
        value={r.provinciaLocalidad}
        className="block max-w-[160px] truncate"
      />
    ),
  },
  {
    key: "telefono",
    label: "Teléfono",
    minW: "min-w-[120px]",
    render: (r) => (
      <CellText value={r.telefono} mono className="text-xs tabular-nums" />
    ),
  },
  {
    key: "transporte",
    label: "Transporte",
    minW: "min-w-[120px]",
    render: (r) => (
      <CellText value={r.transporte} className="block max-w-[130px] truncate" />
    ),
  },
  {
    key: "metodo",
    label: "Método de Pago",
    minW: "min-w-[180px]",
    render: (r) => (
      <span
        className="block max-w-[200px] truncate text-xs"
        title={r.metodoDePago.length > 22 ? r.metodoDePago : undefined}
      >
        {r.metodoDePago || "—"}
      </span>
    ),
  },
  {
    key: "vendedor",
    label: "Vendedor",
    minW: "min-w-[110px]",
    render: (r) => (
      <CellText value={r.vendedor} className="block max-w-[120px] truncate" />
    ),
  },
  {
    key: "condicion",
    label: "Condición Compra",
    minW: "min-w-[130px]",
    render: (r) => (
      <CellText
        value={r.condicionCompra}
        className="block max-w-[140px] truncate"
      />
    ),
  },
  {
    key: "prendas",
    label: "Total Prendas",
    minW: "min-w-[88px]",
    align: "right",
    render: (r) => (
      <span className="tabular-nums">{r.totalPrendas?.trim() || "—"}</span>
    ),
  },
  {
    key: "subtotal",
    label: "Subtotal",
    minW: "min-w-[110px]",
    align: "right",
    render: (r) => <AmountCell value={r.subtotal} />,
  },
  {
    key: "shipCustomer",
    label: "Ship. Customer",
    minW: "min-w-[110px]",
    align: "right",
    render: (r) => <AmountCell value={r.shippingCustomerCost} />,
  },
  {
    key: "envioOwner",
    label: "Envío Owner",
    minW: "min-w-[100px]",
    render: (r) => (
      <CellText value={r.envioOwner} className="block max-w-[110px] truncate" />
    ),
  },
  {
    key: "shipOwner",
    label: "Ship. Owner Cost",
    minW: "min-w-[110px]",
    align: "right",
    render: (r) => <AmountCell value={r.shippingOwnerCost} />,
  },
  {
    key: "recargo",
    label: "Recargo/Desc.",
    minW: "min-w-[110px]",
    align: "right",
    render: (r) => <AmountCell value={r.recargoDescuento} />,
  },
  {
    key: "total",
    label: "Total Final",
    minW: "min-w-[120px]",
    align: "right",
    render: (r) => (
      <span className="font-medium tabular-nums text-[hsl(var(--erp-fg))]">
        {formatAmountDisplay(r.totalFinal)}
      </span>
    ),
  },
  {
    key: "estado",
    label: "Estado",
    minW: "min-w-[100px]",
    render: (r) => <EstadoBadge estado={r.estado} />,
  },
  {
    key: "pagoEnvio",
    label: "Pagó envío",
    minW: "min-w-[130px]",
    render: (r) => <PagoEnvioBadge label={resolvePagoEnvioLabel(r)} />,
  },
  {
    key: "tn",
    label: "TN Order",
    minW: "min-w-[100px]",
    render: (r) => <LongMonoCell value={r.tnOrderId} />,
  },
];

export function ErpRemitosTable({
  remitos,
  showNeonMeta = false,
}: ErpRemitosTableProps) {
  return (
    <div className="erp-card min-w-0 overflow-hidden">
      <div className="flex flex-col gap-1 border-b border-[hsl(var(--erp-border-subtle))] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <p className="text-sm font-medium text-[hsl(var(--erp-fg))]">
          {remitos.length} remito{remitos.length === 1 ? "" : "s"}
        </p>
        <p className="text-[11px] text-[hsl(var(--erp-fg-subtle))]">
          {showNeonMeta
            ? "TN-led · tn_total comercial · reconciliación ERP"
            : "Columnas alineadas a hoja REMITOS · fecha desc"}
        </p>
      </div>

      <div className="divide-y divide-[hsl(var(--erp-border-subtle))] lg:hidden">
        {remitos.map((remito, index) => (
          <ErpRemitoMobileCard
            key={`mobile-${remito.idRemito}-${index}`}
            remito={remito}
            showNeonMeta={showNeonMeta}
          />
        ))}
      </div>

      <div className="relative hidden min-w-0 lg:block">
        <div
          className="pointer-events-none absolute inset-y-0 right-0 z-20 w-10 bg-gradient-to-l from-[hsl(var(--erp-bg-card))] via-[hsl(var(--erp-bg-card)/0.85)] to-transparent"
          aria-hidden
        />
        <div className="erp-table-scroll-wrap erp-scrollbar overflow-x-auto">
          <table className="w-full min-w-[2480px] text-sm">
            <thead className="sticky top-0 z-10 bg-[hsl(var(--erp-bg-card))]">
              <tr className="border-b border-[hsl(var(--erp-border-subtle))] text-left text-[11px] font-medium uppercase tracking-wider text-[hsl(var(--erp-fg-subtle))]">
                {DESKTOP_COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    className={cn(
                      col.minW,
                      "px-4 py-3",
                      col.align === "right" && "text-right",
                      col.key === "fecha" && "whitespace-nowrap"
                    )}
                  >
                    {col.label}
                  </th>
                ))}
                <th className="min-w-[96px] px-4 py-3 text-right">Acción</th>
              </tr>
            </thead>
            <tbody>
              {remitos.map((remito, index) => (
                <tr
                  key={`desktop-${remito.idRemito}-${index}`}
                  className="border-b border-[hsl(var(--erp-border-subtle))] transition-colors last:border-0 hover:bg-[hsl(var(--erp-bg-hover)/0.45)]"
                >
                  {DESKTOP_COLUMNS.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        "px-4 py-3.5 text-[hsl(var(--erp-fg-muted))]",
                        col.align === "right" && "text-right",
                        (col.key === "id" || col.key === "fecha") &&
                          "whitespace-nowrap"
                      )}
                    >
                      {col.key === "estado" ? (
                        <EstadoColumn
                          remito={remito}
                          showNeonMeta={showNeonMeta}
                        />
                      ) : (
                        col.render(remito)
                      )}
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-4 py-3.5 text-right">
                    <VerDetalleLink remito={remito} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-[hsl(var(--erp-border-subtle))] px-4 py-2 text-center text-[10px] text-[hsl(var(--erp-fg-subtle))]">
          Deslizá horizontalmente para ver todas las columnas
        </p>
      </div>
    </div>
  );
}

function ErpRemitoMobileCard({
  remito,
  showNeonMeta = false,
}: {
  remito: ErpRemitoDisplayRow;
  showNeonMeta?: boolean;
}) {
  const pagoEnvio = resolvePagoEnvioLabel(remito);

  return (
    <article className="erp-remito-mobile-card space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p
            className="truncate font-mono text-xs font-medium text-[hsl(var(--erp-fg))]"
            title={remito.idRemito}
          >
            {remito.idRemito}
          </p>
          <p className="mt-1 text-[11px] tabular-nums text-[hsl(var(--erp-fg-muted))]">
            {remito.fechaDisplay || "—"}
          </p>
        </div>
        <EstadoColumn remito={remito} showNeonMeta={showNeonMeta} />
      </div>

      <div className="min-w-0 space-y-1">
        <p className="truncate text-sm font-medium text-[hsl(var(--erp-fg))]">
          {remito.nombre || "—"}
        </p>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[hsl(var(--erp-fg-muted))]">
          {remito.dni?.trim() && <span>DNI {remito.dni}</span>}
          {remito.telefono?.trim() && <span>{remito.telefono}</span>}
        </div>
        {remito.provinciaLocalidad?.trim() && (
          <p className="truncate text-xs text-[hsl(var(--erp-fg-muted))]">
            {remito.provinciaLocalidad}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md border border-[hsl(var(--erp-border))] bg-[hsl(var(--erp-bg-hover))] px-2 py-1 text-xs font-semibold tabular-nums text-[hsl(var(--erp-fg))]">
          {formatAmountDisplay(remito.totalFinal)}
        </span>
        {remito.totalPrendas?.trim() && (
          <span className="text-xs text-[hsl(var(--erp-fg-muted))]">
            {remito.totalPrendas} prenda
            {remito.totalPrendas === "1" ? "" : "s"}
          </span>
        )}
        <PagoEnvioBadge label={pagoEnvio} />
      </div>

      <div className="grid gap-1.5 text-xs text-[hsl(var(--erp-fg-muted))]">
        {remito.metodoDePago?.trim() && (
          <p className="line-clamp-2 leading-snug" title={remito.metodoDePago}>
            <span className="text-[hsl(var(--erp-fg-subtle))]">Pago: </span>
            {remito.metodoDePago}
          </p>
        )}
        {remito.vendedor?.trim() && (
          <p>
            <span className="text-[hsl(var(--erp-fg-subtle))]">Vendedor: </span>
            {remito.vendedor}
          </p>
        )}
        {remito.transporte?.trim() && (
          <p>
            <span className="text-[hsl(var(--erp-fg-subtle))]">Transporte: </span>
            {remito.transporte}
          </p>
        )}
        {remito.condicionCompra?.trim() && (
          <p>
            <span className="text-[hsl(var(--erp-fg-subtle))]">Condición: </span>
            {remito.condicionCompra}
          </p>
        )}
      </div>

      {(remito.subtotal?.trim() ||
        remito.shippingCustomerCost?.trim() ||
        remito.shippingOwnerCost?.trim() ||
        remito.recargoDescuento?.trim()) && (
        <div className="grid grid-cols-2 gap-2 rounded-lg border border-[hsl(var(--erp-border-subtle))] bg-[hsl(var(--erp-bg-hover)/0.35)] p-3 text-[11px]">
          {remito.subtotal?.trim() && (
            <MobileAmountRow label="Subtotal" value={remito.subtotal} />
          )}
          {remito.shippingCustomerCost?.trim() && (
            <MobileAmountRow
              label="Ship. cliente"
              value={remito.shippingCustomerCost}
            />
          )}
          {remito.envioOwner?.trim() && (
            <div className="col-span-2 min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--erp-fg-subtle))]">
                Envío Owner
              </p>
              <p className="truncate">{remito.envioOwner}</p>
            </div>
          )}
          {remito.shippingOwnerCost?.trim() && (
            <MobileAmountRow
              label="Ship. owner"
              value={remito.shippingOwnerCost}
            />
          )}
          {remito.recargoDescuento?.trim() && (
            <MobileAmountRow label="Rec./Desc." value={remito.recargoDescuento} />
          )}
        </div>
      )}

      {remito.tnOrderId?.trim() && (
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wider text-[hsl(var(--erp-fg-subtle))]">
            TN Order
          </p>
          <p
            className="break-all font-mono text-[11px] text-[hsl(var(--erp-cyan))]"
            title={remito.tnOrderId}
          >
            {remito.tnOrderId}
          </p>
        </div>
      )}

      <VerDetalleLink remito={remito} fullWidth />
    </article>
  );
}

function MobileAmountRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--erp-fg-subtle))]">
        {label}
      </p>
      <p className="tabular-nums">{formatAmountDisplay(value)}</p>
    </div>
  );
}

function VerDetalleLink({
  remito,
  fullWidth = false,
}: {
  remito: ErpRemitoDisplayRow;
  fullWidth?: boolean;
}) {
  const erpId = remito.neonMeta?.erpOrderId ?? remito.idRemito;
  const canLink =
    !remito.neonMeta || remito.neonMeta.hasErpRemito
      ? Boolean(erpId && !erpId.startsWith("TN-"))
      : false;

  if (!canLink) {
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center gap-1 rounded-md border border-dashed border-[hsl(var(--erp-border))] px-2.5 py-1.5 text-[11px] text-[hsl(var(--erp-fg-subtle))]",
          fullWidth && "w-full py-2"
        )}
        title="Sin remito ERP — detalle GAS no disponible"
      >
        TN only
      </span>
    );
  }

  return (
    <Link
      href={`/dashboard/remitos/${encodeURIComponent(erpId)}`}
      className={cn(
        "inline-flex items-center justify-center gap-1 rounded-md border border-[hsl(var(--erp-border))] bg-[hsl(var(--erp-bg-hover))] px-2.5 py-1.5 text-[11px] font-medium text-[hsl(var(--erp-fg-muted))] transition-colors hover:border-[hsl(var(--erp-accent)/0.35)] hover:text-[hsl(var(--erp-fg))]",
        fullWidth && "w-full py-2"
      )}
    >
      Ver detalle
      <ExternalLink className="h-3 w-3 shrink-0" />
    </Link>
  );
}

function EstadoColumn({
  remito,
  showNeonMeta,
}: {
  remito: ErpRemitoDisplayRow;
  showNeonMeta: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <EstadoBadge estado={remito.estado} />
      {showNeonMeta && remito.neonMeta ? (
        <ErpRemitosReconciliationBadge meta={remito.neonMeta} compact />
      ) : null}
    </div>
  );
}

function EstadoBadge({ estado }: { estado: string }) {
  const label = estado || "—";
  const lower = label.toLowerCase();
  let className =
    "inline-flex max-w-[140px] shrink-0 truncate rounded-md border px-2 py-0.5 text-[11px] font-medium ";

  if (lower.includes("pagad")) {
    className +=
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  } else if (lower.includes("pend") || lower.includes("abiert")) {
    className += "border-amber-500/30 bg-amber-500/10 text-amber-200";
  } else if (lower.includes("cancel")) {
    className += "border-rose-500/30 bg-rose-500/10 text-rose-300";
  } else {
    className +=
      "border-[hsl(var(--erp-border))] bg-[hsl(var(--erp-bg-hover))] text-[hsl(var(--erp-fg-muted))]";
  }

  return (
    <span className={className} title={label.length > 16 ? label : undefined}>
      {label}
    </span>
  );
}
