"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Calendar,
  Filter,
  Loader2,
  RefreshCw,
  Search,
  X,
} from "lucide-react";

import { ErpRemitosKpiGrid } from "@/components/erp/remitos/erp-remitos-kpi-grid";
import { ErpRemitosTable } from "@/components/erp/remitos/erp-remitos-table";
import { ErpDashboardLoading } from "@/components/erp/shared/erp-dashboard-loading";
import { createFetchGuard, isAbortError } from "@/lib/erp/fetch-guard";
import {
  getPeriodQueryRange,
  normalizeArtDateBounds,
} from "@/lib/erp/period-query-range";
import {
  extractUniqueEstados,
  extractUniqueMetodosPago,
  filterRemitosByEstado,
  filterRemitosByMetodoPago,
} from "@/lib/erp/remitos-filters";
import {
  DEFAULT_PERIOD_PRESET,
  filterRemitosByArtDateRange,
  getAppliedPeriodLabel,
  sortRemitosByDateDesc,
  type PeriodPreset,
} from "@/lib/erp/remitos-date";
import type { ErpRemito, ErpRemitosListResponse } from "@/types/erp";

const PERIOD_OPTIONS: { value: PeriodPreset; label: string }[] = [
  { value: "today", label: "Hoy" },
  { value: "yesterday", label: "Ayer" },
  { value: "7d", label: "Últimos 7 días" },
  { value: "30d", label: "Últimos 30 días" },
  { value: "custom", label: "Rango personalizado" },
  { value: "all", label: "Todos (cargados)" },
];

const inputClass =
  "h-10 rounded-lg border border-[hsl(var(--erp-border))] bg-[hsl(var(--erp-bg-card))] px-3 text-sm text-[hsl(var(--erp-fg))] focus:border-[hsl(var(--erp-accent)/0.5)] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--erp-accent)/0.35)]";

const ALL_FILTER = "all";

export function ErpRemitosDashboard() {
  const fetchGuardRef = useRef(createFetchGuard());

  const [remitos, setRemitos] = useState<ErpRemito[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [listActionUsed, setListActionUsed] = useState<string | null>(null);

  const [periodPreset, setPeriodPreset] =
    useState<PeriodPreset>(DEFAULT_PERIOD_PRESET);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [specificDay, setSpecificDay] = useState("");
  const [estadoFilter, setEstadoFilter] = useState(ALL_FILTER);
  const [metodoFilter, setMetodoFilter] = useState(ALL_FILTER);

  const loadRemitos = useCallback(async (query: string) => {
    const guard = fetchGuardRef.current;
    const { reqId, signal } = guard.begin();
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      const q = query.trim();
      if (q) params.set("q", q);

      const url = `/api/erp/remitos${params.toString() ? `?${params}` : ""}`;
      const res = await fetch(url, { cache: "no-store", signal });
      const json = (await res.json()) as ErpRemitosListResponse & {
        listActionUsed?: string;
      };

      if (!guard.isCurrent(reqId)) return;

      if (!json.ok) {
        throw new Error(json.error ?? `Error ${res.status}`);
      }

      setRemitos(sortRemitosByDateDesc(json.data ?? []));
      setFetchedAt(json.fetchedAt ?? new Date().toISOString());
      setListActionUsed(json.listActionUsed ?? null);
    } catch (e: unknown) {
      if (isAbortError(e)) return;
      if (!guard.isCurrent(reqId)) return;
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      setRemitos([]);
      setListActionUsed(null);
    } finally {
      if (guard.isCurrent(reqId)) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRemitos("");
    return () => fetchGuardRef.current.cancel();
  }, [loadRemitos]);

  const artBounds = useMemo(() => {
    const range = getPeriodQueryRange(
      periodPreset,
      customFrom,
      customTo,
      specificDay
    );
    return normalizeArtDateBounds(range);
  }, [periodPreset, customFrom, customTo, specificDay]);

  const periodLabel = useMemo(
    () =>
      getAppliedPeriodLabel({
        preset: periodPreset,
        customFrom,
        customTo,
        specificDay: specificDay.trim() || null,
      }),
    [periodPreset, customFrom, customTo, specificDay]
  );

  const dateFiltered = useMemo(() => {
    if (!artBounds) return remitos;
    return sortRemitosByDateDesc(
      filterRemitosByArtDateRange(remitos, artBounds.from, artBounds.to)
    );
  }, [remitos, artBounds]);

  const estadoOptions = useMemo(
    () => extractUniqueEstados(dateFiltered),
    [dateFiltered]
  );

  const metodoOptions = useMemo(
    () => extractUniqueMetodosPago(dateFiltered),
    [dateFiltered]
  );

  const estadoFiltered = useMemo(
    () => filterRemitosByEstado(dateFiltered, estadoFilter),
    [dateFiltered, estadoFilter]
  );

  const metodoFiltered = useMemo(
    () => filterRemitosByMetodoPago(estadoFiltered, metodoFilter),
    [estadoFiltered, metodoFilter]
  );

  const viewRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return metodoFiltered;
    return metodoFiltered.filter((r) =>
      [
        r.idRemito,
        r.fechaDisplay,
        r.fechaRaw,
        r.nombre,
        r.dni,
        r.telefono,
        r.provinciaLocalidad,
        r.transporte,
        r.metodoDePago,
        r.vendedor,
        r.condicionCompra,
        r.totalPrendas,
        r.subtotal,
        r.shippingCustomerCost,
        r.envioOwner,
        r.shippingOwnerCost,
        r.recargoDescuento,
        r.totalFinal,
        r.estado,
        r.tnOrderId,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [metodoFiltered, search]);

  const dataReady = !loading;
  const displayRows = dataReady ? viewRows : [];

  const hasActiveFilters =
    periodPreset !== DEFAULT_PERIOD_PRESET ||
    Boolean(specificDay.trim()) ||
    Boolean(customFrom.trim()) ||
    Boolean(customTo.trim()) ||
    estadoFilter !== ALL_FILTER ||
    metodoFilter !== ALL_FILTER ||
    Boolean(search.trim());

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void loadRemitos(search);
  };

  const handleClearFilters = () => {
    setPeriodPreset(DEFAULT_PERIOD_PRESET);
    setCustomFrom("");
    setCustomTo("");
    setSpecificDay("");
    setEstadoFilter(ALL_FILTER);
    setMetodoFilter(ALL_FILTER);
    setSearch("");
  };

  const showDateEmpty =
    dataReady &&
    !error &&
    remitos.length > 0 &&
    displayRows.length === 0 &&
    dateFiltered.length === 0 &&
    !search.trim();

  const showFilterEmpty =
    dataReady &&
    !error &&
    remitos.length > 0 &&
    displayRows.length === 0 &&
    dateFiltered.length > 0 &&
    !search.trim();

  const showSearchEmpty =
    dataReady &&
    !error &&
    remitos.length > 0 &&
    displayRows.length === 0 &&
    dateFiltered.length > 0 &&
    Boolean(search.trim());

  const dataSourceLabel =
    listActionUsed === "listRemitosFull"
      ? "Datos completos · REMITOS"
      : listActionUsed === "listRemitos"
        ? "Datos resumidos · fallback"
        : "Apps Script";

  const isInitialLoad = loading && remitos.length === 0;

  return (
    <div className="min-w-0 max-w-full space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[hsl(var(--erp-border))] bg-[hsl(var(--erp-bg-card))] px-3 py-1 text-[11px] font-medium text-[hsl(var(--erp-fg-muted))]">
            <span className="erp-live-dot h-1.5 w-1.5 rounded-full bg-[hsl(var(--erp-emerald))]" />
            {dataSourceLabel}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-[hsl(var(--erp-fg))] sm:text-3xl">
            Remitos
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[hsl(var(--erp-fg-muted))]">
            Tabla SaaS read-only desde la hoja REMITOS. KPIs y filtros en
            frontend — sin recálculos financieros.
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          {fetchedAt && dataReady && !error && (
            <p className="text-xs text-[hsl(var(--erp-fg-subtle))]">
              Actualizado{" "}
              {new Intl.DateTimeFormat("es-AR", {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(fetchedAt))}
            </p>
          )}
          <button
            type="button"
            onClick={() => void loadRemitos(search)}
            disabled={loading}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-[hsl(var(--erp-border))] bg-[hsl(var(--erp-bg-card))] px-3 text-xs font-medium text-[hsl(var(--erp-fg-muted))] transition-colors hover:text-[hsl(var(--erp-fg))] disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Actualizar
          </button>
        </div>
      </header>

      {dataReady && !error && remitos.length > 0 && (
        <ErpRemitosKpiGrid remitos={displayRows} periodLabel={periodLabel} />
      )}

      {loading && remitos.length > 0 && (
        <ErpDashboardLoading compact />
      )}

      <div className="erp-card space-y-4 p-4 sm:p-5">
        <div className="flex items-center gap-2 text-sm font-medium text-[hsl(var(--erp-fg))]">
          <Filter className="h-4 w-4 text-[hsl(var(--erp-accent))]" />
          Filtros
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2">
            <label
              htmlFor="period-preset"
              className="text-[11px] font-medium uppercase tracking-wider text-[hsl(var(--erp-fg-subtle))]"
            >
              Período
            </label>
            <select
              id="period-preset"
              value={periodPreset}
              onChange={(e) => {
                setPeriodPreset(e.target.value as PeriodPreset);
                setSpecificDay("");
              }}
              className={`${inputClass} w-full`}
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
              <div className="space-y-2">
                <label
                  htmlFor="custom-from"
                  className="text-[11px] font-medium uppercase tracking-wider text-[hsl(var(--erp-fg-subtle))]"
                >
                  Desde
                </label>
                <input
                  id="custom-from"
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className={`${inputClass} w-full`}
                />
              </div>
              <div className="space-y-2">
                <label
                  htmlFor="custom-to"
                  className="text-[11px] font-medium uppercase tracking-wider text-[hsl(var(--erp-fg-subtle))]"
                >
                  Hasta
                </label>
                <input
                  id="custom-to"
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className={`${inputClass} w-full`}
                />
              </div>
            </>
          )}

          <div className="space-y-2">
            <label
              htmlFor="specific-day"
              className="text-[11px] font-medium uppercase tracking-wider text-[hsl(var(--erp-fg-subtle))]"
            >
              Día específico
            </label>
            <div className="flex gap-2">
              <input
                id="specific-day"
                type="date"
                value={specificDay}
                onChange={(e) => setSpecificDay(e.target.value)}
                className={`${inputClass} min-w-0 flex-1`}
              />
              {specificDay && (
                <button
                  type="button"
                  onClick={() => setSpecificDay("")}
                  className="shrink-0 rounded-lg border border-[hsl(var(--erp-border))] px-3 text-xs text-[hsl(var(--erp-fg-muted))] hover:text-[hsl(var(--erp-fg))]"
                >
                  Limpiar
                </button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="estado-filter"
              className="text-[11px] font-medium uppercase tracking-wider text-[hsl(var(--erp-fg-subtle))]"
            >
              Estado
            </label>
            <select
              id="estado-filter"
              value={estadoFilter}
              onChange={(e) => setEstadoFilter(e.target.value)}
              className={`${inputClass} w-full`}
            >
              <option value={ALL_FILTER}>Todos los estados</option>
              {estadoOptions.map((estado) => (
                <option key={estado} value={estado}>
                  {estado}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="metodo-filter"
              className="text-[11px] font-medium uppercase tracking-wider text-[hsl(var(--erp-fg-subtle))]"
            >
              Método de pago
            </label>
            <select
              id="metodo-filter"
              value={metodoFilter}
              onChange={(e) => setMetodoFilter(e.target.value)}
              className={`${inputClass} w-full`}
            >
              <option value={ALL_FILTER}>Todos los métodos</option>
              {metodoOptions.map((metodo) => (
                <option key={metodo} value={metodo}>
                  {metodo}
                </option>
              ))}
            </select>
          </div>
        </div>

        {dataReady && !error && remitos.length > 0 && (
          <div className="flex flex-col gap-3 border-t border-[hsl(var(--erp-border-subtle))] pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-[hsl(var(--erp-fg-muted))]">
              <span className="font-semibold text-[hsl(var(--erp-fg))]">
                {displayRows.length}
              </span>{" "}
              remitos visibles
              <span className="mx-2 text-[hsl(var(--erp-fg-subtle))]">·</span>
              <span className="text-[hsl(var(--erp-fg-subtle))]">Rango: </span>
              <span className="font-medium text-[hsl(var(--erp-accent))]">
                {periodLabel}
              </span>
              {remitos.length !== displayRows.length && (
                <span className="ml-1 text-[hsl(var(--erp-fg-subtle))]">
                  (de {remitos.length} cargados)
                </span>
              )}
            </div>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleClearFilters}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[hsl(var(--erp-border))] bg-[hsl(var(--erp-bg-hover))] px-3 text-xs font-medium text-[hsl(var(--erp-fg-muted))] transition-colors hover:text-[hsl(var(--erp-fg))]"
              >
                <X className="h-3.5 w-3.5" />
                Limpiar filtros
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <form onSubmit={handleSearchSubmit} className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--erp-fg-subtle))]" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar ID, cliente, DNI, teléfono, TN, estado…"
            className="h-10 w-full rounded-lg border border-[hsl(var(--erp-border))] bg-[hsl(var(--erp-bg-card))] pl-10 pr-4 text-sm text-[hsl(var(--erp-fg))] placeholder:text-[hsl(var(--erp-fg-subtle))] focus:border-[hsl(var(--erp-accent)/0.5)] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--erp-accent)/0.35)]"
          />
        </form>
        <Link
          href="/remitos"
          className="inline-flex h-10 items-center justify-center rounded-lg border border-[hsl(var(--erp-accent)/0.35)] bg-[hsl(var(--erp-accent)/0.12)] px-4 text-sm font-medium text-[hsl(var(--erp-fg))] transition-colors hover:bg-[hsl(var(--erp-accent)/0.2)]"
        >
          Remitos prod. ↗
        </Link>
      </div>

      {isInitialLoad && (
        <ErpDashboardLoading label="Cargando remitos desde Apps Script…" />
      )}

      {!loading && error && (
        <div className="erp-card flex flex-col items-center gap-4 border-rose-500/20 bg-rose-500/5 px-6 py-12 text-center">
          <AlertCircle className="h-10 w-10 text-rose-400" />
          <div>
            <p className="text-sm font-medium text-[hsl(var(--erp-fg))]">
              No se pudieron cargar los remitos
            </p>
            <p className="mt-1 max-w-md text-xs text-[hsl(var(--erp-fg-muted))]">
              {error}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadRemitos(search)}
            className="rounded-lg border border-[hsl(var(--erp-border))] bg-[hsl(var(--erp-bg-card))] px-4 py-2 text-sm font-medium text-[hsl(var(--erp-fg))]"
          >
            Reintentar
          </button>
        </div>
      )}

      {dataReady && !error && remitos.length === 0 && (
        <div className="erp-card flex flex-col items-center gap-2 py-16 text-center">
          <p className="text-sm font-medium text-[hsl(var(--erp-fg))]">
            No hay remitos para mostrar
          </p>
          <p className="text-xs text-[hsl(var(--erp-fg-muted))]">
            El listado llegó vacío desde Apps Script.
          </p>
        </div>
      )}

      {showDateEmpty && (
        <div className="erp-card flex flex-col items-center gap-3 py-12 text-center">
          <Calendar className="h-10 w-10 text-[hsl(var(--erp-fg-subtle))]" />
          <div>
            <p className="text-sm font-medium text-[hsl(var(--erp-fg))]">
              No hay remitos en este rango
            </p>
            <p className="mt-1 text-xs text-[hsl(var(--erp-fg-muted))]">
              Rango aplicado: {periodLabel}. Probá ampliar las fechas o limpiar
              filtros.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClearFilters}
            className="rounded-lg border border-[hsl(var(--erp-border))] bg-[hsl(var(--erp-bg-card))] px-4 py-2 text-sm font-medium text-[hsl(var(--erp-fg))]"
          >
            Limpiar filtros
          </button>
        </div>
      )}

      {showFilterEmpty && !showDateEmpty && (
        <div className="erp-card flex flex-col items-center gap-2 py-12 text-center">
          <Filter className="h-10 w-10 text-[hsl(var(--erp-fg-subtle))]" />
          <p className="text-sm font-medium text-[hsl(var(--erp-fg))]">
            Sin remitos con estos filtros
          </p>
          <p className="text-xs text-[hsl(var(--erp-fg-muted))]">
            Probá otro estado, método de pago o limpiá los filtros.
          </p>
        </div>
      )}

      {showSearchEmpty && !showDateEmpty && !showFilterEmpty && (
        <div className="erp-card flex flex-col items-center gap-2 py-12 text-center">
          <p className="text-sm font-medium text-[hsl(var(--erp-fg))]">
            Sin resultados para la búsqueda
          </p>
          <p className="text-xs text-[hsl(var(--erp-fg-muted))]">
            Probá con otro término o limpiá los filtros.
          </p>
        </div>
      )}

      {dataReady && !error && displayRows.length > 0 && (
        <ErpRemitosTable remitos={displayRows} />
      )}
    </div>
  );
}
