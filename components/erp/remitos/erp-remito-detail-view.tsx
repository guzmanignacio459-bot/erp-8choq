"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  CreditCard,
  Loader2,
  Package,
  RefreshCw,
  User,
  Truck,
} from "lucide-react";

import { hasMercadoPagoDetailData } from "@/lib/erp/remito-detail-mapper";
import {
  formatRemitosCurrency,
  parseRemitoAmount,
} from "@/lib/erp/remitos-kpis";
import { resolvePagoEnvioLabel } from "@/lib/erp/remitos-shipping-display";
import { cn } from "@/lib/utils";
import type {
  ErpMpApplyResponse,
  ErpRemitoDetail,
  ErpRemitoDetailResponse,
} from "@/types/erp";

function formatAmountDisplay(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) return "—";
  const amount = parseRemitoAmount(trimmed);
  if (amount !== 0) return formatRemitosCurrency(amount);
  return trimmed;
}

function DetailField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  const text = value?.trim() || "—";
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-wider text-[hsl(var(--erp-fg-subtle))]">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-sm text-[hsl(var(--erp-fg))]",
          mono && "font-mono text-xs",
          text === "—" && "text-[hsl(var(--erp-fg-subtle))]"
        )}
      >
        {text}
      </p>
    </div>
  );
}

function SectionCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section className="erp-card p-4 sm:p-5">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[hsl(var(--erp-border))] bg-[hsl(var(--erp-bg-hover))] text-[hsl(var(--erp-accent))]">
          <Icon className="h-4 w-4" />
        </div>
        <h2 className="text-sm font-semibold text-[hsl(var(--erp-fg))]">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

function EstadoBadge({ estado }: { estado: string }) {
  const label = estado || "—";
  const lower = label.toLowerCase();
  let className =
    "inline-flex rounded-md border px-2.5 py-1 text-xs font-medium ";

  if (lower.includes("pagad")) {
    className +=
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  } else if (lower.includes("pend") || lower.includes("abiert")) {
    className += "border-amber-500/30 bg-amber-500/10 text-amber-200";
  } else if (lower.includes("cancel") || lower.includes("anul")) {
    className += "border-rose-500/30 bg-rose-500/10 text-rose-300";
  } else {
    className +=
      "border-[hsl(var(--erp-border))] bg-[hsl(var(--erp-bg-hover))] text-[hsl(var(--erp-fg-muted))]";
  }

  return <span className={className}>{label}</span>;
}

function PagoEnvioBadge({ label }: { label: string }) {
  let className =
    "inline-flex rounded-md border px-2.5 py-1 text-xs font-medium ";

  if (label === "Cliente") {
    className += "border-cyan-500/30 bg-cyan-500/10 text-cyan-200";
  } else if (label === "8Q") {
    className += "border-violet-500/30 bg-violet-500/10 text-violet-200";
  } else {
    className +=
      "border-[hsl(var(--erp-border))] bg-[hsl(var(--erp-bg-hover))] text-[hsl(var(--erp-fg-subtle))]";
  }

  return <span className={className}>{label}</span>;
}

export function ErpRemitoDetailView() {
  const params = useParams<{ id: string }>();
  const idRemito = decodeURIComponent(params?.id ?? "").trim();

  const [remito, setRemito] = useState<ErpRemitoDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [gasActionUsed, setGasActionUsed] = useState<string | null>(null);
  const [mpApplying, setMpApplying] = useState(false);
  const [mpApplyMessage, setMpApplyMessage] = useState<string | null>(null);
  const [mpApplyError, setMpApplyError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!idRemito) return;
    setLoading(true);
    setError(null);
    setNotFound(false);

    try {
      const res = await fetch(
        `/api/erp/remitos/${encodeURIComponent(idRemito)}`,
        { cache: "no-store" }
      );
      const json = (await res.json()) as ErpRemitoDetailResponse;

      if (!json.ok || !json.data) {
        setRemito(null);
        setError(json.error ?? `Error ${res.status}`);
        setNotFound(res.status === 404);
        return;
      }

      setRemito(json.data);
      setGasActionUsed(json.gasActionUsed ?? null);
    } catch (e: unknown) {
      setRemito(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [idRemito]);

  const handleApplyMercadoPago = useCallback(async () => {
    if (!remito?.tnOrderId?.trim()) return;
    setMpApplying(true);
    setMpApplyMessage(null);
    setMpApplyError(null);

    try {
      const res = await fetch("/api/erp/mp/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tnOrderId: remito.tnOrderId.trim(),
          force: false,
        }),
      });
      const json = (await res.json()) as ErpMpApplyResponse;

      if (!json.ok) {
        setMpApplyError(json.error ?? `Error ${res.status}`);
        return;
      }

      setMpApplyMessage(
        json.message ??
          (json.skipped
            ? "Mercado Pago ya estaba aplicado."
            : "Mercado Pago aplicado correctamente.")
      );
      await load();
    } catch (e: unknown) {
      setMpApplyError(e instanceof Error ? e.message : String(e));
    } finally {
      setMpApplying(false);
    }
  }, [remito?.tnOrderId, load]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24">
        <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--erp-accent))]" />
        <p className="text-sm text-[hsl(var(--erp-fg-muted))]">
          Cargando remito…
        </p>
      </div>
    );
  }

  if (error || !remito) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-4 sm:p-6 lg:p-8">
        <Link
          href="/dashboard/remitos"
          className="inline-flex items-center gap-2 text-sm text-[hsl(var(--erp-fg-muted))] hover:text-[hsl(var(--erp-fg))]"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a Remitos
        </Link>
        <div className="erp-card flex flex-col items-center gap-4 border-rose-500/20 bg-rose-500/5 px-6 py-12 text-center">
          <AlertCircle className="h-10 w-10 text-rose-400" />
          <div>
            <p className="text-sm font-medium text-[hsl(var(--erp-fg))]">
              {notFound ? "Remito no encontrado" : "No se pudo cargar el remito"}
            </p>
            <p className="mt-1 text-xs text-[hsl(var(--erp-fg-muted))]">
              {error}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-[hsl(var(--erp-border))] bg-[hsl(var(--erp-bg-card))] px-4 py-2 text-sm font-medium"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  const pagoEnvio = resolvePagoEnvioLabel(remito);
  const hasMp = hasMercadoPagoDetailData(remito);
  const tnOrderId = remito.tnOrderId?.trim() ?? "";
  const canApplyMp = Boolean(tnOrderId) && !hasMp;

  return (
    <div className="min-w-0 max-w-full space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <header className="erp-card p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-3">
            <Link
              href="/dashboard/remitos"
              className="inline-flex items-center gap-2 text-sm text-[hsl(var(--erp-fg-muted))] transition-colors hover:text-[hsl(var(--erp-fg))]"
            >
              <ArrowLeft className="h-4 w-4" />
              Volver a Remitos
            </Link>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-mono text-xl font-semibold tracking-tight text-[hsl(var(--erp-fg))] sm:text-2xl">
                {remito.idRemito}
              </h1>
              <EstadoBadge estado={remito.estado} />
            </div>
            <p className="text-sm tabular-nums text-[hsl(var(--erp-fg-muted))]">
              {remito.fechaDisplay || remito.fechaRaw || "—"}
            </p>
            {gasActionUsed && (
              <p className="text-[10px] text-[hsl(var(--erp-fg-subtle))]">
                Fuente: GAS · {gasActionUsed}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex h-9 shrink-0 items-center gap-2 self-start rounded-lg border border-[hsl(var(--erp-border))] bg-[hsl(var(--erp-bg-card))] px-3 text-xs font-medium text-[hsl(var(--erp-fg-muted))] hover:text-[hsl(var(--erp-fg))]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Actualizar
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <SectionCard title="Cliente" icon={User}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DetailField label="Nombre" value={remito.nombre} />
            <DetailField label="DNI" value={remito.dni} mono />
            <DetailField label="Teléfono" value={remito.telefono} mono />
            <DetailField
              label="Provincia / Localidad"
              value={remito.provinciaLocalidad}
            />
          </div>
        </SectionCard>

        <SectionCard title="Operativo" icon={Truck}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DetailField label="Transporte" value={remito.transporte} />
            <DetailField label="Vendedor" value={remito.vendedor} />
            <DetailField
              label="Condición compra"
              value={remito.condicionCompra}
            />
            <DetailField label="Método de pago" value={remito.metodoDePago} />
            <DetailField
              label="TN Order ID"
              value={remito.tnOrderId}
              mono
            />
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Totales del remito" icon={Package}>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <DetailField label="Total prendas" value={remito.totalPrendas} />
          <DetailField
            label="Subtotal"
            value={formatAmountDisplay(remito.subtotal)}
          />
          <DetailField
            label="Shipping Customer Cost"
            value={formatAmountDisplay(remito.shippingCustomerCost)}
          />
          <DetailField label="Envío Owner" value={remito.envioOwner} />
          <DetailField
            label="Shipping Owner Cost"
            value={formatAmountDisplay(remito.shippingOwnerCost)}
          />
          <DetailField
            label="Recargo / Descuento"
            value={formatAmountDisplay(remito.recargoDescuento)}
          />
          <div className="min-w-0 sm:col-span-2">
            <p className="text-[10px] font-medium uppercase tracking-wider text-[hsl(var(--erp-fg-subtle))]">
              Total Final
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-[hsl(var(--erp-fg))]">
              {formatAmountDisplay(remito.totalFinal)}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wider text-[hsl(var(--erp-fg-subtle))]">
              Pagó envío
            </p>
            <div className="mt-2">
              <PagoEnvioBadge label={pagoEnvio} />
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Mercado Pago" icon={CreditCard}>
        <div className="mb-4 space-y-3 border-b border-[hsl(var(--erp-border-subtle))] pb-4">
          {hasMp ? (
            <p className="inline-flex items-center rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-300">
              Mercado Pago aplicado
            </p>
          ) : canApplyMp ? (
            <button
              type="button"
              onClick={() => void handleApplyMercadoPago()}
              disabled={mpApplying}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-[hsl(var(--erp-accent)/0.35)] bg-[hsl(var(--erp-accent)/0.12)] px-4 text-sm font-medium text-[hsl(var(--erp-fg))] transition-colors hover:bg-[hsl(var(--erp-accent)/0.2)] disabled:opacity-50"
            >
              {mpApplying ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Aplicando MP…
                </>
              ) : (
                "Aplicar Mercado Pago"
              )}
            </button>
          ) : (
            <p className="text-sm text-[hsl(var(--erp-fg-muted))]">
              No hay TN_ORDER_ID disponible
            </p>
          )}

          {mpApplyMessage && (
            <p className="text-sm text-emerald-300">{mpApplyMessage}</p>
          )}
          {mpApplyError && (
            <p className="text-sm text-rose-300">{mpApplyError}</p>
          )}
        </div>

        {hasMp ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <DetailField
              label="Payment ID"
              value={remito.mpPaymentId ?? ""}
              mono
            />
            <DetailField label="Estado" value={remito.mpStatus ?? ""} />
            <DetailField
              label="Detalle estado"
              value={remito.mpStatusDetail ?? ""}
            />
            <DetailField label="Tipo" value={remito.mpPaymentType ?? ""} />
            <DetailField label="Método" value={remito.mpPaymentMethod ?? ""} />
            <DetailField label="Cuotas" value={remito.mpInstallments ?? ""} />
            <DetailField
              label="Monto operación"
              value={formatAmountDisplay(remito.mpTransactionAmount)}
            />
            <DetailField
              label="Neto recibido"
              value={formatAmountDisplay(remito.mpNetReceivedAmount)}
            />
            <DetailField
              label="Impuestos"
              value={formatAmountDisplay(remito.mpTaxTotalReal)}
            />
            <DetailField
              label="Financing"
              value={formatAmountDisplay(remito.mpFinancingTotalReal)}
            />
            <DetailField
              label="Fee MP"
              value={formatAmountDisplay(remito.mpFeeTotalReal)}
            />
            <DetailField
              label="Platform Fee"
              value={formatAmountDisplay(remito.mpPlatformFeeTotalReal)}
            />
            <DetailField
              label="Costo total MP"
              value={formatAmountDisplay(remito.mpTotalCostReal)}
            />
            <DetailField
              label="Neto real orden"
              value={formatAmountDisplay(remito.mpNetoRealOrden)}
            />
            <DetailField
              label="% costo MP"
              value={remito.mpCostPercentReal ?? ""}
            />
            <DetailField
              label="Fecha aprobado"
              value={remito.mpDateApproved ?? ""}
            />
            <DetailField
              label="Importado en MP"
              value={remito.mpImportedAt ?? ""}
            />
            <DetailField
              label="Payer email"
              value={remito.mpPayerEmail ?? ""}
            />
          </div>
        ) : (
          <p className="text-sm text-[hsl(var(--erp-fg-muted))]">
            Mercado Pago no aplicado o no disponible
          </p>
        )}
      </SectionCard>

      <SectionCard title="Ítems" icon={Package}>
        {remito.items.length > 0 ? (
          <div className="space-y-3">
            {remito.items.map((item, index) => (
              <article
                key={`${item.sku}-${index}`}
                className="rounded-lg border border-[hsl(var(--erp-border-subtle))] bg-[hsl(var(--erp-bg-hover)/0.35)] p-3 sm:p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-[hsl(var(--erp-fg))]">
                      {item.articulo || "—"}
                    </p>
                    <p className="mt-1 font-mono text-[11px] text-[hsl(var(--erp-fg-muted))]">
                      SKU {item.sku || "—"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-4 text-sm">
                    <span className="text-[hsl(var(--erp-fg-muted))]">
                      Talle{" "}
                      <span className="font-medium text-[hsl(var(--erp-fg))]">
                        {item.talle || "—"}
                      </span>
                    </span>
                    <span className="text-[hsl(var(--erp-fg-muted))]">
                      Cant.{" "}
                      <span className="font-medium tabular-nums text-[hsl(var(--erp-fg))]">
                        {item.cantidad || "—"}
                      </span>
                    </span>
                    <span className="font-medium tabular-nums text-[hsl(var(--erp-fg))]">
                      {formatAmountDisplay(item.precioUnitario)}
                    </span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[hsl(var(--erp-fg-muted))]">
            Sin ítems en este remito
          </p>
        )}
      </SectionCard>
    </div>
  );
}
