"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Layers,
  Loader2,
  Package,
  RefreshCw,
  Search,
} from "lucide-react";

import { ErpRemitoItemsAnalytics } from "@/components/erp/remito-items/erp-remito-items-analytics";
import { ErpRemitoItemsKpiGrid } from "@/components/erp/remito-items/erp-remito-items-kpi-grid";
import { ErpRemitoItemsTable } from "@/components/erp/remito-items/erp-remito-items-table";
import {
  computeRemitoItemsProductAnalytics,
  computeRemitoItemsSummary,
} from "@/lib/erp/remito-items-aggregator";
import { filterRemitoItemsClient } from "@/lib/erp/remito-items-filter";
import {
  DEFAULT_PERIOD_PRESET,
  getAppliedPeriodLabel,
  type PeriodPreset,
} from "@/lib/erp/remitos-date";
import type {
  ErpRemitoItemRow,
  ErpRemitoItemsResponse,
} from "@/types/erp";

const PERIOD_OPTIONS: { value: PeriodPreset; label: string }[] = [
  { value: "today", label: "Hoy" },
  { value: "yesterday", label: "Ayer" },
  { value: "7d", label: "Últimos 7 días" },
  { value: "30d", label: "Últimos 30 días" },
  { value: "custom", label: "Rango personalizado" },
  { value: "all", label: "Todos" },
];

const OWNER_OPTIONS = [
  { value: "", label: "Todos los owners" },
  { value: "8Q", label: "8Q" },
  { value: "SCNL", label: "SCNL" },
];

const inputClass =
  "h-10 rounded-lg border border-[hsl(var(--erp-border))] bg-[hsl(var(--erp-bg-card))] px-3 text-sm text-[hsl(var(--erp-fg))] focus:border-[hsl(var(--erp-accent)/0.5)] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--erp-accent)/0.35)]";

function formatIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function getQueryRange(
  preset: PeriodPreset,
  customFrom: string,
  customTo: string
): { from?: string; to?: string } {
  if (preset === "all") return {};
  const now = new Date();
  const todayStart = startOfDay(now);
  switch (preset) {
    case "today":
      return { from: formatIsoDate(todayStart), to: formatIsoDate(now) };
    case "yesterday": {
      const y = new Date(todayStart);
      y.setDate(y.getDate() - 1);
      return { from: formatIsoDate(y), to: formatIsoDate(y) };
    }
    case "7d": {
      const start = new Date(todayStart);
      start.setDate(start.getDate() - 6);
      return { from: formatIsoDate(start), to: formatIsoDate(now) };
    }
    case "30d": {
      const start = new Date(todayStart);
      start.setDate(start.getDate() - 29);
      return { from: formatIsoDate(start), to: formatIsoDate(now) };
    }
    case "custom": {
      const range: { from?: string; to?: string } = {};
      if (customFrom.trim()) range.from = customFrom.trim();
      if (customTo.trim()) range.to = customTo.trim();
      return range;
    }
    default:
      return {};
  }
}

export function ErpRemitoItemsDashboard() {
  const [items, setItems] = useState<ErpRemitoItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [gasActionUsed, setGasActionUsed] = useState<string | null>(null);

  const [periodPreset, setPeriodPreset] =
    useState<PeriodPreset>(DEFAULT_PERIOD_PRESET);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [gasSku, setGasSku] = useState("");
  const [gasOwner, setGasOwner] = useState("");

  const [clientArticulo, setClientArticulo] = useState("");
  const [clientTalle, setClientTalle] = useState("");
  const [clientQ, setClientQ] = useState("");

  const periodLabel = useMemo(
    () =>
      getAppliedPeriodLabel({
        preset: periodPreset,
        customFrom,
        customTo,
        specificDay: null,
      }),
    [periodPreset, customFrom, customTo]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const range = getQueryRange(periodPreset, customFrom, customTo);
      const params = new URLSearchParams();
      if (range.from) params.set("from", range.from);
      if (range.to) params.set("to", range.to);
      if (gasSku.trim()) params.set("sku", gasSku.trim());
      if (gasOwner.trim()) params.set("owner", gasOwner.trim());

      const url = `/api/erp/remito-items${params.toString() ? `?${params}` : ""}`;
      const res = await fetch(url, { cache: "no-store" });
      const json = (await res.json()) as ErpRemitoItemsResponse;

      if (!json.ok || !json.data) {
        setItems([]);
        setError(json.error ?? `Error ${res.status}`);
        return;
      }

      setItems(json.data.items);
      setFetchedAt(json.fetchedAt);
      setGasActionUsed(json.gasActionUsed ?? null);
    } catch (e: unknown) {
      setItems([]);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [periodPreset, customFrom, customTo, gasSku, gasOwner]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredItems = useMemo(
    () =>
      filterRemitoItemsClient(items, {
        articulo: clientArticulo,
        talle: clientTalle,
        q: clientQ,
      }),
    [items, clientArticulo, clientTalle, clientQ]
  );

  const summary = useMemo(
    () => computeRemitoItemsSummary(filteredItems),
    [filteredItems]
  );

  const productAnalytics = useMemo(
    () => computeRemitoItemsProductAnalytics(filteredItems),
    [filteredItems]
  );

  return (
    <div className="min-w-0 max-w-full space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="erp-card p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-[hsl(var(--erp-accent))]" />
              <h1 className="text-xl font-semibold tracking-tight text-[hsl(var(--erp-fg))] sm:text-2xl">
                Ítems de remito
              </h1>
            </div>
            <p className="text-sm text-[hsl(var(--erp-fg-muted))]">
              1 prenda = 1 fila · REMITO_ITEMS read-only
            </p>
            {fetchedAt && (
              <p className="text-[10px] text-[hsl(var(--erp-fg-subtle))]">
                Actualizado{" "}
                {new Intl.DateTimeFormat("es-AR", {
                  dateStyle: "short",
                  timeStyle: "short",
                }).format(new Date(fetchedAt))}
                {gasActionUsed ? ` · Fuente: ${gasActionUsed}` : ""}
                {` · ${filteredItems.length} filas visibles`}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex h-9 shrink-0 items-center gap-2 self-start rounded-lg border border-[hsl(var(--erp-border))] bg-[hsl(var(--erp-bg-card))] px-3 text-xs font-medium text-[hsl(var(--erp-fg-muted))] hover:text-[hsl(var(--erp-fg))] disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
            />
            Actualizar
          </button>
        </div>

        <div className="mt-4 grid gap-3 border-t border-[hsl(var(--erp-border-subtle))] pt-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-medium uppercase tracking-wider text-[hsl(var(--erp-fg-subtle))]">
              Período (GAS)
            </label>
            <select
              value={periodPreset}
              onChange={(e) =>
                setPeriodPreset(e.target.value as PeriodPreset)
              }
              className={inputClass}
            >
              {PERIOD_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {periodPreset === "custom" && (
            <>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-medium uppercase tracking-wider text-[hsl(var(--erp-fg-subtle))]">
                  Desde
                </label>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-medium uppercase tracking-wider text-[hsl(var(--erp-fg-subtle))]">
                  Hasta
                </label>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className={inputClass}
                />
              </div>
            </>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-medium uppercase tracking-wider text-[hsl(var(--erp-fg-subtle))]">
              SKU (GAS)
            </label>
            <input
              type="search"
              value={gasSku}
              onChange={(e) => setGasSku(e.target.value)}
              placeholder="Filtrar SKU…"
              className={inputClass}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-medium uppercase tracking-wider text-[hsl(var(--erp-fg-subtle))]">
              Owner (GAS)
            </label>
            <select
              value={gasOwner}
              onChange={(e) => setGasOwner(e.target.value)}
              className={inputClass}
            >
              {OWNER_OPTIONS.map((opt) => (
                <option key={opt.value || "all"} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5 md:col-span-2">
            <label className="text-[10px] font-medium uppercase tracking-wider text-[hsl(var(--erp-fg-subtle))]">
              Artículo (cliente)
            </label>
            <input
              type="search"
              value={clientArticulo}
              onChange={(e) => setClientArticulo(e.target.value)}
              placeholder="Filtrar artículo…"
              className={inputClass}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-medium uppercase tracking-wider text-[hsl(var(--erp-fg-subtle))]">
              Talle (cliente)
            </label>
            <input
              type="search"
              value={clientTalle}
              onChange={(e) => setClientTalle(e.target.value)}
              placeholder="Ej. M, L…"
              className={inputClass}
            />
          </div>

          <div className="flex flex-col gap-1.5 md:col-span-2 xl:col-span-1">
            <label className="text-[10px] font-medium uppercase tracking-wider text-[hsl(var(--erp-fg-subtle))]">
              Búsqueda libre (cliente)
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--erp-fg-subtle))]" />
              <input
                type="search"
                value={clientQ}
                onChange={(e) => setClientQ(e.target.value)}
                placeholder="ID, SKU, artículo…"
                className={`${inputClass} pl-9`}
              />
            </div>
          </div>
        </div>

        <p className="mt-3 text-xs text-[hsl(var(--erp-fg-muted))]">
          {periodLabel}
        </p>
      </header>

      {loading && items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-24">
          <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--erp-accent))]" />
          <p className="text-sm text-[hsl(var(--erp-fg-muted))]">
            Cargando ítems…
          </p>
        </div>
      ) : error && items.length === 0 ? (
        <div className="erp-card flex flex-col items-center gap-4 border-rose-500/20 bg-rose-500/5 px-6 py-12 text-center">
          <AlertCircle className="h-10 w-10 text-rose-400" />
          <div>
            <p className="text-sm font-medium text-[hsl(var(--erp-fg))]">
              No se pudieron cargar los ítems
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
      ) : (
        <>
          {error && (
            <div className="erp-card border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-200">
              {error}
            </div>
          )}

          <ErpRemitoItemsKpiGrid summary={summary} periodLabel={periodLabel} />

          <ErpRemitoItemsAnalytics analytics={productAnalytics} />

          <section className="erp-card p-4 sm:p-5">
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[hsl(var(--erp-border))] bg-[hsl(var(--erp-bg-hover))] text-[hsl(var(--erp-accent))]">
                <Package className="h-4 w-4" />
              </div>
              <h2 className="text-sm font-semibold text-[hsl(var(--erp-fg))]">
                Detalle por prenda
              </h2>
              <span className="text-xs text-[hsl(var(--erp-fg-muted))]">
                ({filteredItems.length} filas)
              </span>
            </div>
            <ErpRemitoItemsTable items={filteredItems} />
          </section>
        </>
      )}
    </div>
  );
}
