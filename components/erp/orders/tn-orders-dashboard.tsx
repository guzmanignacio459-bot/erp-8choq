"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Filter,
  Loader2,
  RefreshCw,
  Search,
  X,
} from "lucide-react";

import { TnOrdersKpiGrid } from "@/components/erp/orders/tn-orders-kpi-grid";
import { TnOrdersStagingBadge } from "@/components/erp/orders/tn-orders-staging-badge";
import { TnOrdersTable } from "@/components/erp/orders/tn-orders-table";
import { ErpDashboardLoading } from "@/components/erp/shared/erp-dashboard-loading";
import { createFetchGuard, isAbortError } from "@/lib/erp/fetch-guard";
import {
  getBoundsForPreset,
  getPeriodRangeLabel,
  resolvePeriodRange,
} from "@/lib/erp/period-query-range";
import {
  DEFAULT_PERIOD_PRESET,
  type PeriodPreset,
} from "@/lib/erp/remitos-date";
import { fetchAllV2CommercialOrders } from "@/lib/erp/v2/fetch-v2-orders-client";
import { sortV2OrdersByTnDateDesc } from "@/lib/erp/v2/sort-v2-orders";
import type { V2CommercialOrder } from "@/types/erp-v2-api";

const PERIOD_OPTIONS: { value: PeriodPreset; label: string }[] = [
  { value: "today", label: "Hoy" },
  { value: "yesterday", label: "Ayer" },
  { value: "7d", label: "Últimos 7 días" },
  { value: "30d", label: "Últimos 30 días" },
  { value: "custom", label: "Rango personalizado" },
  { value: "all", label: "Todos (cargados)" },
];

const COMMERCIAL_STATUS_OPTIONS: {
  value: string;
  label: string;
}[] = [
  { value: "all", label: "Todos los estados" },
  { value: "activo", label: "Activo" },
  { value: "pendiente", label: "Pendiente" },
  { value: "cancelado", label: "Cancelado" },
  { value: "reembolsado", label: "Reembolsado" },
];

const inputClass =
  "h-10 rounded-lg border border-[hsl(var(--erp-border))] bg-[hsl(var(--erp-bg-card))] px-3 text-sm text-[hsl(var(--erp-fg))] focus:border-[hsl(var(--erp-accent)/0.5)] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--erp-accent)/0.35)]";

export function TnOrdersDashboard() {
  const fetchGuardRef = useRef(createFetchGuard());

  const [orders, setOrders] = useState<V2CommercialOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [urlMeta, setUrlMeta] = useState<string | null>(null);
  const [serverKpi, setServerKpi] = useState<
    | {
        ordersInRange: number;
        facturacionTotal: number;
      }
    | undefined
  >(undefined);

  const [periodPreset, setPeriodPreset] =
    useState<PeriodPreset>(DEFAULT_PERIOD_PRESET);
  const [dateFrom, setDateFrom] = useState(
    () => getBoundsForPreset(DEFAULT_PERIOD_PRESET)?.from ?? ""
  );
  const [dateTo, setDateTo] = useState(
    () => getBoundsForPreset(DEFAULT_PERIOD_PRESET)?.to ?? ""
  );
  const [statusFilter, setStatusFilter] = useState("all");

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

  const loadOrders = useCallback(
    async (query: string, range: { from: string; to: string } | null) => {
      const guard = fetchGuardRef.current;
      const { reqId, signal } = guard.begin();
      setLoading(true);
      setError(null);

      try {
        const json = await fetchAllV2CommercialOrders({
          from: range?.from,
          to: range?.to,
          kpi: Boolean(range),
          q: query,
          commercialStatus:
            statusFilter !== "all" ? statusFilter : undefined,
          signal,
        });

        if (!guard.isCurrent(reqId)) return;

        if (!json.ok) {
          throw new Error(
            json.error ??
              "Neon staging no disponible (revisá ERP_V2_DB_READ y DATABASE_URL)"
          );
        }

        setOrders(sortV2OrdersByTnDateDesc(json.data ?? []));
        setFetchedAt(json.fetchedAt ?? new Date().toISOString());
        setUrlMeta(
          json.urlMeta
            ? `${json.urlMeta.database}@${json.urlMeta.host}`
            : "neon-staging"
        );
        setServerKpi(
          json.kpi
            ? {
                ordersInRange: json.kpi.ordersInRange,
                facturacionTotal: json.kpi.facturacionTotal,
              }
            : undefined
        );
      } catch (e: unknown) {
        if (isAbortError(e)) return;
        if (!guard.isCurrent(reqId)) return;
        const message = e instanceof Error ? e.message : String(e);
        setError(message);
        setOrders([]);
        setServerKpi(undefined);
      } finally {
        if (guard.isCurrent(reqId)) setLoading(false);
      }
    },
    [statusFilter]
  );

  const reload = useCallback(
    (query: string) => loadOrders(query, fetchRange),
    [loadOrders, fetchRange]
  );

  useEffect(() => {
    if (rangeInvalid) {
      setLoading(false);
      return () => fetchGuardRef.current.cancel();
    }
    void loadOrders("", fetchRange);
    return () => fetchGuardRef.current.cancel();
  }, [loadOrders, fetchRange, rangeInvalid]);

  const dataReady = !loading;
  const displayOrders = dataReady ? orders : [];

  const hasActiveFilters =
    periodPreset !== DEFAULT_PERIOD_PRESET ||
    periodPreset === "custom" ||
    periodPreset === "all" ||
    statusFilter !== "all" ||
    Boolean(search.trim());

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

  const handleClearFilters = () => {
    setPeriodPreset(DEFAULT_PERIOD_PRESET);
    const bounds = getBoundsForPreset(DEFAULT_PERIOD_PRESET);
    setDateFrom(bounds?.from ?? "");
    setDateTo(bounds?.to ?? "");
    setStatusFilter("all");
    setSearch("");
  };

  const isInitialLoad = loading && orders.length === 0;

  return (
    <div className="min-w-0 max-w-full space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <TnOrdersStagingBadge detail={urlMeta ?? undefined} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-[hsl(var(--erp-fg))] sm:text-3xl">
            Órdenes Tiendanube
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[hsl(var(--erp-fg-muted))]">
            Ventas ecommerce desde{" "}
            <code className="rounded bg-[hsl(var(--erp-bg-hover))] px-1 py-0.5 text-[11px]">
              tn_orders
            </code>
            . Total = tn_total; remito ERP es enriquecimiento opcional.
          </p>
          <p className="mt-2 text-[11px] text-[hsl(var(--erp-fg-subtle))]">
            Remitos GAS / legacy:{" "}
            <Link
              href="/dashboard/remitos"
              className="text-[hsl(var(--erp-accent))] hover:underline"
            >
              /dashboard/remitos
            </Link>
            {" · "}
            Neon remitos:{" "}
            <Link
              href="/dashboard/remitos?source=neon"
              className="text-[hsl(var(--erp-accent))] hover:underline"
            >
              ?source=neon
            </Link>
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
            onClick={() => void reload(search)}
            disabled={loading || rangeInvalid}
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

      {dataReady && !error && displayOrders.length > 0 && !rangeInvalid && (
        <TnOrdersKpiGrid
          orders={displayOrders}
          periodLabel={periodLabel}
          serverKpi={serverKpi}
        />
      )}

      {loading && orders.length > 0 && <ErpDashboardLoading compact />}

      <div className="erp-card space-y-4 p-4 sm:p-5">
        <div className="flex items-center gap-2 text-sm font-medium text-[hsl(var(--erp-fg))]">
          <Filter className="h-4 w-4 text-[hsl(var(--erp-accent))]" />
          Filtros
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <div className="space-y-2">
            <label
              htmlFor="tn-period-preset"
              className="text-[11px] font-medium uppercase tracking-wider text-[hsl(var(--erp-fg-subtle))]"
            >
              Período
            </label>
            <select
              id="tn-period-preset"
              value={periodPreset}
              onChange={(e) =>
                handlePresetChange(e.target.value as PeriodPreset)
              }
              className={`${inputClass} w-full`}
            >
              {PERIOD_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="tn-date-from"
              className="text-[11px] font-medium uppercase tracking-wider text-[hsl(var(--erp-fg-subtle))]"
            >
              Desde
            </label>
            <input
              id="tn-date-from"
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPeriodPreset("custom");
              }}
              disabled={periodPreset !== "custom"}
              className={`${inputClass} w-full`}
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="tn-date-to"
              className="text-[11px] font-medium uppercase tracking-wider text-[hsl(var(--erp-fg-subtle))]"
            >
              Hasta
            </label>
            <input
              id="tn-date-to"
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPeriodPreset("custom");
              }}
              disabled={periodPreset !== "custom"}
              className={`${inputClass} w-full`}
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="tn-status-filter"
              className="text-[11px] font-medium uppercase tracking-wider text-[hsl(var(--erp-fg-subtle))]"
            >
              Estado comercial
            </label>
            <select
              id="tn-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={`${inputClass} w-full`}
            >
              {COMMERCIAL_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="tn-search"
              className="text-[11px] font-medium uppercase tracking-wider text-[hsl(var(--erp-fg-subtle))]"
            >
              Buscar
            </label>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void reload(search);
              }}
              className="relative"
            >
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--erp-fg-subtle))]" />
              <input
                id="tn-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ID TN, cliente, remito…"
                className={`${inputClass} w-full pl-9`}
              />
            </form>
          </div>
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={handleClearFilters}
            className="inline-flex items-center gap-1.5 text-xs text-[hsl(var(--erp-fg-muted))] hover:text-[hsl(var(--erp-fg))]"
          >
            <X className="h-3.5 w-3.5" />
            Limpiar filtros
          </button>
        )}
      </div>

      {rangeInvalid && (
        <div className="erp-card flex items-start gap-3 border-[hsl(var(--erp-danger)/0.35)] p-4 text-sm text-[hsl(var(--erp-danger))]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Rango de fechas inválido. Revisá las fechas desde/hasta.</p>
        </div>
      )}

      {isInitialLoad && <ErpDashboardLoading label="Cargando órdenes TN…" />}

      {error && (
        <div className="erp-card flex items-start gap-3 border-[hsl(var(--erp-danger)/0.35)] p-4 text-sm">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--erp-danger))]" />
          <div>
            <p className="font-medium text-[hsl(var(--erp-danger))]">
              Error al cargar órdenes
            </p>
            <p className="mt-1 text-[hsl(var(--erp-fg-muted))]">{error}</p>
          </div>
        </div>
      )}

      {dataReady && !error && (
        <div className="erp-card min-w-0 p-0 sm:p-0">
          <div className="flex items-center justify-between border-b border-[hsl(var(--erp-border))] px-4 py-3 sm:px-5">
            <p className="text-sm font-medium text-[hsl(var(--erp-fg))]">
              {displayOrders.length}{" "}
              {displayOrders.length === 1 ? "orden" : "órdenes"}
            </p>
          </div>
          <div className="p-2 sm:p-4">
            <TnOrdersTable orders={displayOrders} />
          </div>
        </div>
      )}
    </div>
  );
}
