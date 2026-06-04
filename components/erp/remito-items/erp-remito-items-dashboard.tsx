"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertCircle,
  Layers,
  Package,
  RefreshCw,
  Search,
} from "lucide-react";

import { ErpRemitoItemsDebugStrip } from "@/components/erp/remito-items/erp-remito-items-debug-strip";
import { ErpRemitoItemsAnalytics } from "@/components/erp/remito-items/erp-remito-items-analytics";
import { ErpRemitoItemsKpiGrid } from "@/components/erp/remito-items/erp-remito-items-kpi-grid";
import { ErpRemitoItemsTable } from "@/components/erp/remito-items/erp-remito-items-table";
import { ErpDashboardLoading } from "@/components/erp/shared/erp-dashboard-loading";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { createFetchGuard, isAbortError } from "@/lib/erp/fetch-guard";
import {
  computeRemitoItemsProductAnalytics,
  computeRemitoItemsSummary,
} from "@/lib/erp/remito-items-aggregator";
import { filterRemitoItemsClient } from "@/lib/erp/remito-items-filter";
import {
  buildRemitoItemsApiUrl,
  buildRemitoItemsQuerySignature,
} from "@/lib/erp/remito-items-query";
import { sortRemitoItemsByFechaDesc } from "@/lib/erp/remito-items-sort";
import {
  getBoundsForPreset,
  getPeriodRangeLabel,
  resolvePeriodRange,
} from "@/lib/erp/period-query-range";
import { DEFAULT_PERIOD_PRESET, type PeriodPreset } from "@/lib/erp/remitos-date";
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

const GAS_SKU_DEBOUNCE_MS = 400;
const CUSTOM_DATE_DEBOUNCE_MS = 450;

const inputClass =
  "h-10 rounded-lg border border-[hsl(var(--erp-border))] bg-[hsl(var(--erp-bg-card))] px-3 text-sm text-[hsl(var(--erp-fg))] focus:border-[hsl(var(--erp-accent)/0.5)] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--erp-accent)/0.35)]";

const DEV_DEBUG =
  typeof process !== "undefined" && process.env.NODE_ENV === "development";

export function ErpRemitoItemsDashboard() {
  const fetchGuardRef = useRef(createFetchGuard());
  const querySignatureRef = useRef<string | null>(null);

  const [items, setItems] = useState<ErpRemitoItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [gasActionUsed, setGasActionUsed] = useState<string | null>(null);
  /** Firma del último fetch aplicado a `items` (anti-respuesta obsoleta). */
  const [loadedSignature, setLoadedSignature] = useState<string | null>(null);

  const [periodPreset, setPeriodPreset] =
    useState<PeriodPreset>(DEFAULT_PERIOD_PRESET);
  const [dateFrom, setDateFrom] = useState(
    () => getBoundsForPreset(DEFAULT_PERIOD_PRESET)?.from ?? ""
  );
  const [dateTo, setDateTo] = useState(
    () => getBoundsForPreset(DEFAULT_PERIOD_PRESET)?.to ?? ""
  );
  const [gasSku, setGasSku] = useState("");
  const [gasOwner, setGasOwner] = useState("");
  const debouncedGasSku = useDebouncedValue(gasSku, GAS_SKU_DEBOUNCE_MS);

  const [clientArticulo, setClientArticulo] = useState("");
  const [clientTalle, setClientTalle] = useState("");
  const [clientQ, setClientQ] = useState("");
  const [debugPanel, setDebugPanel] = useState(false);

  const debouncedDateFrom = useDebouncedValue(
    dateFrom,
    periodPreset === "custom" ? CUSTOM_DATE_DEBOUNCE_MS : 0
  );
  const debouncedDateTo = useDebouncedValue(
    dateTo,
    periodPreset === "custom" ? CUSTOM_DATE_DEBOUNCE_MS : 0
  );

  const effectiveDateFrom =
    periodPreset === "custom" ? debouncedDateFrom : dateFrom;
  const effectiveDateTo = periodPreset === "custom" ? debouncedDateTo : dateTo;

  const customDatesPending =
    periodPreset === "custom" &&
    (dateFrom !== debouncedDateFrom || dateTo !== debouncedDateTo);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setDebugPanel(
      new URLSearchParams(window.location.search).get("debugItems") === "1"
    );
  }, []);

  const resolvedPeriod = useMemo(
    () =>
      resolvePeriodRange(periodPreset, effectiveDateFrom, effectiveDateTo),
    [periodPreset, effectiveDateFrom, effectiveDateTo]
  );

  const querySignature = useMemo(
    () =>
      buildRemitoItemsQuerySignature(
        resolvedPeriod,
        debouncedGasSku,
        gasOwner
      ),
    [resolvedPeriod, debouncedGasSku, gasOwner]
  );

  querySignatureRef.current = querySignature;

  const periodLabel = useMemo(
    () => getPeriodRangeLabel(periodPreset, dateFrom, dateTo),
    [periodPreset, dateFrom, dateTo]
  );

  const gasSkuPending = gasSku.trim() !== debouncedGasSku.trim();

  const hasClientFilters = Boolean(
    clientArticulo.trim() || clientTalle.trim() || clientQ.trim()
  );

  const load = useCallback(async () => {
    const guard = fetchGuardRef.current;
    const { reqId, signal } = guard.begin();

    if (resolvedPeriod.kind === "invalid") {
      setItems([]);
      setLoadedSignature(null);
      setError(resolvedPeriod.message);
      setLoading(false);
      return;
    }

    const signatureAtStart = querySignatureRef.current;
    const url = buildRemitoItemsApiUrl(signatureAtStart);
    if (!url || !signatureAtStart) {
      setItems([]);
      setLoadedSignature(null);
      setError("No se pudo armar la consulta de ítems.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setItems([]);
    setLoadedSignature(null);

    try {
      const res = await fetch(url, { cache: "no-store", signal });
      const json = (await res.json()) as ErpRemitoItemsResponse;

      if (!guard.isCurrent(reqId)) return;
      if (signatureAtStart !== querySignatureRef.current) return;

      if (!json.ok || !json.data) {
        setItems([]);
        setLoadedSignature(null);
        setError(json.error ?? `Error ${res.status}`);
        return;
      }

      const rows = json.data.items ?? [];
      setItems(rows);
      setLoadedSignature(signatureAtStart);
      setFetchedAt(json.fetchedAt);
      setGasActionUsed(json.gasActionUsed ?? null);

      if (DEV_DEBUG) {
        console.debug("[remito-items] fetch ok", {
          url,
          signature: signatureAtStart,
          rowsReceived: rows.length,
          apiSummaryPrendas: json.data.summary?.totalPrendas,
        });
      }
    } catch (e: unknown) {
      if (isAbortError(e)) return;
      if (!guard.isCurrent(reqId)) return;
      if (signatureAtStart !== querySignatureRef.current) return;
      setItems([]);
      setLoadedSignature(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (guard.isCurrent(reqId) && signatureAtStart === querySignatureRef.current) {
        setLoading(false);
      }
    }
  }, [resolvedPeriod, querySignature]);

  const handlePresetChange = (next: PeriodPreset) => {
    setPeriodPreset(next);
    const bounds = getBoundsForPreset(next);
    if (bounds) {
      setDateFrom(bounds.from);
      setDateTo(bounds.to);
    } else if (next === "all") {
      setDateFrom("");
      setDateTo("");
    }
  };

  const handleDateFromChange = (value: string) => {
    setDateFrom(value);
    setPeriodPreset("custom");
  };

  const handleDateToChange = (value: string) => {
    setDateTo(value);
    setPeriodPreset("custom");
  };

  useEffect(() => {
    void load();
    return () => fetchGuardRef.current.cancel();
  }, [load]);

  useLayoutEffect(() => {
    if (resolvedPeriod.kind === "invalid") return;
    if (!querySignature) return;
    if (loadedSignature === querySignature) return;
    setLoading(true);
    setItems([]);
    setLoadedSignature(null);
  }, [querySignature, resolvedPeriod.kind, loadedSignature]);

  const querySynced =
    querySignature != null &&
    loadedSignature != null &&
    querySignature === loadedSignature;

  const dataReady =
    !loading && !gasSkuPending && !customDatesPending && querySynced;

  const apiFrom =
    resolvedPeriod.kind === "bounded" ? resolvedPeriod.from : null;
  const apiTo = resolvedPeriod.kind === "bounded" ? resolvedPeriod.to : null;
  const debugFetchUrl = buildRemitoItemsApiUrl(querySignature);

  /** Única fuente para tabla, KPIs y analytics (filtros cliente incluidos). */
  const displayItems = useMemo(() => {
    if (!dataReady) return [];
    const filtered = filterRemitoItemsClient(items, {
      articulo: clientArticulo,
      talle: clientTalle,
      q: clientQ,
    });
    return sortRemitoItemsByFechaDesc(filtered);
  }, [dataReady, items, clientArticulo, clientTalle, clientQ]);

  const displaySummary = useMemo(
    () => computeRemitoItemsSummary(displayItems),
    [displayItems]
  );

  const displayAnalytics = useMemo(
    () => computeRemitoItemsProductAnalytics(displayItems),
    [displayItems]
  );

  useEffect(() => {
    if (!DEV_DEBUG || !dataReady) return;
    console.debug("[remito-items] view", {
      querySignature,
      rowsLoaded: items.length,
      rowsDisplay: displayItems.length,
      kpiPrendas: displaySummary.totalPrendas,
      clientFilters: hasClientFilters,
    });
  }, [
    dataReady,
    querySignature,
    items.length,
    displayItems.length,
    displaySummary.totalPrendas,
    hasClientFilters,
  ]);

  const rangeInvalid = resolvedPeriod.kind === "invalid";
  const isInitialLoad = loading && items.length === 0 && !loadedSignature;
  const showRefreshing =
    loading ||
    gasSkuPending ||
    customDatesPending ||
    (querySignature != null && !querySynced);

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
            {fetchedAt && dataReady && (
              <p className="text-[10px] text-[hsl(var(--erp-fg-subtle))]">
                Actualizado{" "}
                {new Intl.DateTimeFormat("es-AR", {
                  dateStyle: "short",
                  timeStyle: "short",
                }).format(new Date(fetchedAt))}
                {gasActionUsed ? ` · Fuente: ${gasActionUsed}` : ""}
                {` · ${displayItems.length} filas visibles`}
                {hasClientFilters ? " · filtros cliente activos" : ""}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={
              loading || rangeInvalid || gasSkuPending || customDatesPending
            }
            className="inline-flex h-9 shrink-0 items-center gap-2 self-start rounded-lg border border-[hsl(var(--erp-border))] bg-[hsl(var(--erp-bg-card))] px-3 text-xs font-medium text-[hsl(var(--erp-fg-muted))] hover:text-[hsl(var(--erp-fg))] disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${showRefreshing ? "animate-spin" : ""}`}
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
                handlePresetChange(e.target.value as PeriodPreset)
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

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-medium uppercase tracking-wider text-[hsl(var(--erp-fg-subtle))]">
              Desde
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => handleDateFromChange(e.target.value)}
              disabled={periodPreset !== "custom"}
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-medium uppercase tracking-wider text-[hsl(var(--erp-fg-subtle))]">
              Hasta
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => handleDateToChange(e.target.value)}
              disabled={periodPreset !== "custom"}
              className={inputClass}
            />
          </div>

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
          {showRefreshing ? " · Actualizando…" : ""}
          {customDatesPending ? " · Aplicando fechas…" : ""}
          {gasSkuPending ? " · Aplicando SKU…" : ""}
        </p>
      </header>

      {debugPanel && (
        <ErpRemitoItemsDebugStrip
          querySignature={querySignature}
          loadedSignature={loadedSignature}
          loading={loading}
          gasSkuPending={gasSkuPending}
          customDatesPending={customDatesPending}
          itemsLength={items.length}
          displayItemsLength={displayItems.length}
          apiFrom={apiFrom}
          apiTo={apiTo}
          fetchUrl={debugFetchUrl}
          dataReady={dataReady}
          showRefreshing={showRefreshing}
        />
      )}

      {rangeInvalid ? (
        <div className="erp-card border-amber-500/20 bg-amber-500/5 px-4 py-8 text-center text-sm text-amber-200">
          {resolvedPeriod.message}
        </div>
      ) : isInitialLoad ? (
        <ErpDashboardLoading label="Cargando ítems…" />
      ) : error && items.length === 0 && !loadedSignature ? (
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

          {showRefreshing ? (
            <ErpDashboardLoading compact />
          ) : (
            <>
              <ErpRemitoItemsKpiGrid
                key={loadedSignature ?? "remito-items-kpi"}
                summary={displaySummary}
                periodLabel={periodLabel}
              />

              <ErpRemitoItemsAnalytics
                key={loadedSignature ?? "remito-items-analytics"}
                analytics={displayAnalytics}
              />

              <section
                key={loadedSignature ?? "remito-items-table"}
                className="erp-card p-4 sm:p-5"
              >
                <div className="mb-4 flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[hsl(var(--erp-border))] bg-[hsl(var(--erp-bg-hover))] text-[hsl(var(--erp-accent))]">
                    <Package className="h-4 w-4" />
                  </div>
                  <h2 className="text-sm font-semibold text-[hsl(var(--erp-fg))]">
                    Detalle por prenda
                  </h2>
                  <span className="text-xs text-[hsl(var(--erp-fg-muted))]">
                    ({displayItems.length} filas)
                  </span>
                </div>
                <ErpRemitoItemsTable items={displayItems} />
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
