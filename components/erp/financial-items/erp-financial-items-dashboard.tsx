"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Layers, Loader2, RefreshCw, Search } from "lucide-react";

import { ErpFinancialItemsKpiGrid } from "@/components/erp/financial-items/erp-financial-items-kpi-grid";
import { ErpFinancialItemsTable } from "@/components/erp/financial-items/erp-financial-items-table";
import { ErpDashboardLoading } from "@/components/erp/shared/erp-dashboard-loading";
import { createFetchGuard, isAbortError } from "@/lib/erp/fetch-guard";
import {
  getBoundsForPreset,
  getPeriodRangeLabel,
  resolvePeriodRange,
} from "@/lib/erp/period-query-range";
import { DEFAULT_PERIOD_PRESET, type PeriodPreset } from "@/lib/erp/remitos-date";
import type {
  V2FinancialItemRow,
  V2FinancialItemsKpi,
  V2FinancialItemsListResponse,
} from "@/types/erp-v2-financial-items";

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

export function ErpFinancialItemsDashboard() {
  const fetchGuardRef = useRef(createFetchGuard());

  const [items, setItems] = useState<V2FinancialItemRow[]>([]);
  const [kpi, setKpi] = useState<V2FinancialItemsKpi | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);

  const [periodPreset, setPeriodPreset] =
    useState<PeriodPreset>(DEFAULT_PERIOD_PRESET);
  const [dateFrom, setDateFrom] = useState(
    () => getBoundsForPreset(DEFAULT_PERIOD_PRESET)?.from ?? ""
  );
  const [dateTo, setDateTo] = useState(
    () => getBoundsForPreset(DEFAULT_PERIOD_PRESET)?.to ?? ""
  );
  const [search, setSearch] = useState("");

  const resolvedPeriod = useMemo(
    () => resolvePeriodRange(periodPreset, dateFrom, dateTo),
    [periodPreset, dateFrom, dateTo]
  );
  const periodLabel = useMemo(
    () => getPeriodRangeLabel(periodPreset, dateFrom, dateTo),
    [periodPreset, dateFrom, dateTo]
  );
  const rangeInvalid = resolvedPeriod.kind === "invalid";
  const fetchRange = useMemo(() => {
    if (resolvedPeriod.kind === "bounded") {
      return { from: resolvedPeriod.from, to: resolvedPeriod.to };
    }
    return null;
  }, [resolvedPeriod]);

  const load = useCallback(
    async (q: string, range: { from: string; to: string } | null) => {
      const guard = fetchGuardRef.current;
      const { reqId, signal } = guard.begin();
      setLoading(true);
      setError(null);

      try {
        const sp = new URLSearchParams();
        if (range?.from) sp.set("from", range.from);
        if (range?.to) sp.set("to", range.to);
        if (q.trim()) sp.set("q", q.trim());
        sp.set("page", "1");
        sp.set("perPage", "100");

        const res = await fetch(`/api/v2/financial-items?${sp}`, {
          cache: "no-store",
          signal,
        });
        const json = (await res.json()) as V2FinancialItemsListResponse;

        if (!guard.isCurrent(reqId)) return;

        if (!res.ok || !json.ok) {
          throw new Error(json.error ?? `HTTP ${res.status}`);
        }

        setItems(json.data ?? []);
        setKpi(json.kpi ?? null);
        setTotal(json.total ?? 0);
        setFetchedAt(json.fetchedAt ?? new Date().toISOString());
      } catch (e: unknown) {
        if (isAbortError(e)) return;
        if (!guard.isCurrent(reqId)) return;
        setError(e instanceof Error ? e.message : String(e));
        setItems([]);
        setKpi(null);
      } finally {
        if (guard.isCurrent(reqId)) setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (rangeInvalid) {
      setLoading(false);
      return () => fetchGuardRef.current.cancel();
    }
    void load(search, fetchRange);
    return () => fetchGuardRef.current.cancel();
  }, [load, search, fetchRange, rangeInvalid]);

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

  return (
    <div className="min-w-0 max-w-full space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[hsl(var(--erp-border))] bg-[hsl(var(--erp-bg-hover))] text-[hsl(var(--erp-accent))]">
              <Layers className="h-4 w-4" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-[hsl(var(--erp-fg))]">
              Financial Items
            </h1>
          </div>
          <p className="max-w-2xl text-sm text-[hsl(var(--erp-fg-muted))]">
            Fuente financiera unificada M6 — grain 1 prenda = 1 fila. M6.1: origen TN
            Orders.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load(search, fetchRange)}
          disabled={loading || rangeInvalid}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-[hsl(var(--erp-border))] bg-[hsl(var(--erp-bg-card))] px-3 text-xs font-medium text-[hsl(var(--erp-fg-muted))] hover:text-[hsl(var(--erp-fg))] disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Actualizar
        </button>
      </header>

      <div className="erp-card grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-2">
          <label className="text-[11px] font-medium uppercase tracking-wider text-[hsl(var(--erp-fg-subtle))]">
            Período
          </label>
          <select
            value={periodPreset}
            onChange={(e) => handlePresetChange(e.target.value as PeriodPreset)}
            className={`${inputClass} w-full`}
          >
            {PERIOD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-[11px] font-medium uppercase tracking-wider text-[hsl(var(--erp-fg-subtle))]">
            Desde
          </label>
          <input
            type="date"
            value={dateFrom}
            disabled={periodPreset !== "custom"}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPeriodPreset("custom");
            }}
            className={`${inputClass} w-full`}
          />
        </div>
        <div className="space-y-2">
          <label className="text-[11px] font-medium uppercase tracking-wider text-[hsl(var(--erp-fg-subtle))]">
            Hasta
          </label>
          <input
            type="date"
            value={dateTo}
            disabled={periodPreset !== "custom"}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPeriodPreset("custom");
            }}
            className={`${inputClass} w-full`}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <label className="text-[11px] font-medium uppercase tracking-wider text-[hsl(var(--erp-fg-subtle))]">
            Buscar
          </label>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void load(search, fetchRange);
            }}
            className="relative"
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--erp-fg-subtle))]" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="SKU, producto, cliente, orden TN…"
              className={`${inputClass} w-full pl-9`}
            />
          </form>
        </div>
      </div>

      {rangeInvalid && (
        <div className="erp-card flex items-start gap-3 border-[hsl(var(--erp-danger)/0.35)] p-4 text-sm text-[hsl(var(--erp-danger))]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Rango de fechas inválido.</p>
        </div>
      )}

      {loading && items.length === 0 && (
        <ErpDashboardLoading label="Cargando financial items…" />
      )}

      {error && (
        <div className="erp-card flex items-start gap-3 border-[hsl(var(--erp-danger)/0.35)] p-4 text-sm text-[hsl(var(--erp-danger))]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {!error && kpi && !rangeInvalid && (
        <ErpFinancialItemsKpiGrid kpi={kpi} periodLabel={periodLabel} />
      )}

      {!error && !rangeInvalid && (
        <div className="erp-card min-w-0 overflow-hidden">
          <div className="flex items-center justify-between border-b border-[hsl(var(--erp-border))] px-4 py-3">
            <p className="text-sm font-medium text-[hsl(var(--erp-fg))]">
              {total} ítems · mostrando {items.length}
            </p>
            {fetchedAt && (
              <p className="text-xs text-[hsl(var(--erp-fg-subtle))]">
                {new Date(fetchedAt).toLocaleString("es-AR")}
              </p>
            )}
          </div>
          <ErpFinancialItemsTable items={items} />
        </div>
      )}
    </div>
  );
}
