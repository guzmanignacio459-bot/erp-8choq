"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  BarChart3,
  Calendar,
  Loader2,
  RefreshCw,
} from "lucide-react";

import { ErpAnalyticsKpiGrid } from "@/components/erp/analytics/erp-analytics-kpi-grid";
import { ErpAnalyticsMetaSlot } from "@/components/erp/analytics/erp-analytics-meta-slot";
import { ErpAnalyticsSalesByDay } from "@/components/erp/analytics/erp-analytics-sales-by-day";
import { ErpAnalyticsTopProducts } from "@/components/erp/analytics/erp-analytics-top-products";
import { ErpDashboardLoading } from "@/components/erp/shared/erp-dashboard-loading";
import { createFetchGuard, isAbortError } from "@/lib/erp/fetch-guard";
import {
  appendPeriodRangeToSearchParams,
  getBoundsForPreset,
  getPeriodRangeLabel,
  resolvePeriodRange,
} from "@/lib/erp/period-query-range";
import { DEFAULT_PERIOD_PRESET, type PeriodPreset } from "@/lib/erp/remitos-date";
import type { ErpAnalyticsResponse, ErpAnalyticsSummary } from "@/types/erp";

const PERIOD_OPTIONS: { value: PeriodPreset; label: string }[] = [
  { value: "today", label: "Hoy" },
  { value: "yesterday", label: "Ayer" },
  { value: "7d", label: "Últimos 7 días" },
  { value: "30d", label: "Últimos 30 días" },
  { value: "custom", label: "Rango personalizado" },
  { value: "all", label: "Todos" },
];

const inputClass =
  "h-10 rounded-lg border border-[hsl(var(--erp-border))] bg-[hsl(var(--erp-bg-card))] px-3 text-sm text-[hsl(var(--erp-fg))] focus:border-[hsl(var(--erp-accent)/0.5)] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--erp-accent)/0.35)]";

function SectionCard({
  title,
  icon: Icon,
  children,
  action,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="erp-card p-4 sm:p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[hsl(var(--erp-border))] bg-[hsl(var(--erp-bg-hover))] text-[hsl(var(--erp-accent))]">
            <Icon className="h-4 w-4" />
          </div>
          <h2 className="text-sm font-semibold text-[hsl(var(--erp-fg))]">
            {title}
          </h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function ErpAnalyticsDashboard() {
  const fetchGuardRef = useRef(createFetchGuard());

  const [summary, setSummary] = useState<ErpAnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [gasActionUsed, setGasActionUsed] = useState<string | null>(null);

  const [periodPreset, setPeriodPreset] =
    useState<PeriodPreset>(DEFAULT_PERIOD_PRESET);
  const [dateFrom, setDateFrom] = useState(
    () => getBoundsForPreset(DEFAULT_PERIOD_PRESET)?.from ?? ""
  );
  const [dateTo, setDateTo] = useState(
    () => getBoundsForPreset(DEFAULT_PERIOD_PRESET)?.to ?? ""
  );

  const resolvedPeriod = useMemo(
    () => resolvePeriodRange(periodPreset, dateFrom, dateTo),
    [periodPreset, dateFrom, dateTo]
  );

  const periodLabel = useMemo(
    () => getPeriodRangeLabel(periodPreset, dateFrom, dateTo),
    [periodPreset, dateFrom, dateTo]
  );

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

  const load = useCallback(async () => {
    const guard = fetchGuardRef.current;
    const { reqId, signal } = guard.begin();
    setLoading(true);
    setError(null);

    if (resolvedPeriod.kind === "invalid") {
      setSummary(null);
      setError(resolvedPeriod.message);
      setLoading(false);
      return;
    }

    try {
      const params = new URLSearchParams();
      appendPeriodRangeToSearchParams(params, resolvedPeriod);

      const url = `/api/erp/analytics${params.toString() ? `?${params}` : ""}`;
      const res = await fetch(url, { cache: "no-store", signal });
      const json = (await res.json()) as ErpAnalyticsResponse;

      if (!guard.isCurrent(reqId)) return;

      if (!json.ok || !json.data) {
        setSummary(null);
        setError(json.error ?? `Error ${res.status}`);
        return;
      }

      setSummary(json.data);
      setFetchedAt(json.fetchedAt);
      setGasActionUsed(json.gasActionUsed ?? null);
    } catch (e: unknown) {
      if (isAbortError(e)) return;
      if (!guard.isCurrent(reqId)) return;
      setSummary(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (guard.isCurrent(reqId)) setLoading(false);
    }
  }, [resolvedPeriod]);

  useEffect(() => {
    void load();
    return () => fetchGuardRef.current.cancel();
  }, [load]);

  const dataReady = !loading;
  const viewSummary = dataReady ? summary : null;
  const isInitialLoad = loading && !summary;
  const rangeInvalid = resolvedPeriod.kind === "invalid";

  return (
    <div className="min-w-0 max-w-full space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="erp-card p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-[hsl(var(--erp-accent))]" />
              <h1 className="text-xl font-semibold tracking-tight text-[hsl(var(--erp-fg))] sm:text-2xl">
                Analytics
              </h1>
            </div>
            <p className="text-sm text-[hsl(var(--erp-fg-muted))]">
              Métricas read-only desde REMITOS · Sin Meta Ads conectado
            </p>
            {fetchedAt && dataReady && viewSummary && (
              <p className="text-[10px] text-[hsl(var(--erp-fg-subtle))]">
                Actualizado{" "}
                {new Intl.DateTimeFormat("es-AR", {
                  dateStyle: "short",
                  timeStyle: "short",
                }).format(new Date(fetchedAt))}
                {gasActionUsed ? ` · Fuente: ${gasActionUsed}` : ""}
                {viewSummary.analyticsSource === "listRemitosFull-fallback"
                  ? " · fallback listRemitosFull"
                  : ""}
                {` · ${viewSummary.remitosInScope} remitos en scope`}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading || rangeInvalid}
            className="inline-flex h-9 shrink-0 items-center gap-2 self-start rounded-lg border border-[hsl(var(--erp-border))] bg-[hsl(var(--erp-bg-card))] px-3 text-xs font-medium text-[hsl(var(--erp-fg-muted))] hover:text-[hsl(var(--erp-fg))] disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
            />
            Actualizar
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-3 border-t border-[hsl(var(--erp-border-subtle))] pt-4 lg:flex-row lg:flex-wrap lg:items-end">
          <div className="flex min-w-0 flex-col gap-1.5">
            <label className="text-[10px] font-medium uppercase tracking-wider text-[hsl(var(--erp-fg-subtle))]">
              Período
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

          <div className="flex min-w-0 flex-col gap-1.5">
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
          <div className="flex min-w-0 flex-col gap-1.5">
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

          <p className="text-xs text-[hsl(var(--erp-fg-muted))] lg:pb-2">
            {periodLabel}
            {loading ? " · Actualizando…" : ""}
            {periodPreset === "all"
              ? " · Sin filtro de fechas en API"
              : ""}
          </p>
        </div>
      </header>

      {rangeInvalid ? (
        <div className="erp-card border-amber-500/20 bg-amber-500/5 px-4 py-8 text-center text-sm text-amber-200">
          {resolvedPeriod.message}
        </div>
      ) : isInitialLoad ? (
        <ErpDashboardLoading label="Cargando analytics…" />
      ) : (error || !summary) && !loading ? (
        <div className="erp-card flex flex-col items-center gap-4 border-rose-500/20 bg-rose-500/5 px-6 py-12 text-center">
          <AlertCircle className="h-10 w-10 text-rose-400" />
          <div>
            <p className="text-sm font-medium text-[hsl(var(--erp-fg))]">
              No se pudieron cargar las métricas
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
          {loading ? (
            <ErpDashboardLoading compact />
          ) : viewSummary ? (
            <>
              <ErpAnalyticsKpiGrid
                totals={viewSummary.totals}
                periodLabel={periodLabel}
              />

              <SectionCard title="Ventas por día" icon={Calendar}>
                <ErpAnalyticsSalesByDay salesByDay={viewSummary.salesByDay} />
              </SectionCard>

              <SectionCard title="Top productos" icon={BarChart3}>
                <ErpAnalyticsTopProducts section={viewSummary.topProducts} />
              </SectionCard>

              <ErpAnalyticsMetaSlot meta={viewSummary.meta} />
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
