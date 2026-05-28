"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import {
  DEFAULT_PERIOD_PRESET,
  getAppliedPeriodLabel,
  type PeriodPreset,
} from "@/lib/erp/remitos-date";
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

function getAnalyticsQueryRange(
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
  const [summary, setSummary] = useState<ErpAnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [gasActionUsed, setGasActionUsed] = useState<string | null>(null);

  const [periodPreset, setPeriodPreset] =
    useState<PeriodPreset>(DEFAULT_PERIOD_PRESET);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

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
      const range = getAnalyticsQueryRange(
        periodPreset,
        customFrom,
        customTo
      );
      const params = new URLSearchParams();
      if (range.from) params.set("from", range.from);
      if (range.to) params.set("to", range.to);

      const url = `/api/erp/analytics${params.toString() ? `?${params}` : ""}`;
      const res = await fetch(url, { cache: "no-store" });
      const json = (await res.json()) as ErpAnalyticsResponse;

      if (!json.ok || !json.data) {
        setSummary(null);
        setError(json.error ?? `Error ${res.status}`);
        return;
      }

      setSummary(json.data);
      setFetchedAt(json.fetchedAt);
      setGasActionUsed(json.gasActionUsed ?? null);
    } catch (e: unknown) {
      setSummary(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [periodPreset, customFrom, customTo]);

  useEffect(() => {
    void load();
  }, [load]);

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
            {fetchedAt && (
              <p className="text-[10px] text-[hsl(var(--erp-fg-subtle))]">
                Actualizado{" "}
                {new Intl.DateTimeFormat("es-AR", {
                  dateStyle: "short",
                  timeStyle: "short",
                }).format(new Date(fetchedAt))}
                {gasActionUsed ? ` · Fuente: ${gasActionUsed}` : ""}
                {summary?.analyticsSource === "listRemitosFull-fallback"
                  ? " · fallback listRemitosFull"
                  : ""}
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

        <div className="mt-4 flex flex-col gap-3 border-t border-[hsl(var(--erp-border-subtle))] pt-4 lg:flex-row lg:flex-wrap lg:items-end">
          <div className="flex min-w-0 flex-col gap-1.5">
            <label className="text-[10px] font-medium uppercase tracking-wider text-[hsl(var(--erp-fg-subtle))]">
              Período
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
              <div className="flex min-w-0 flex-col gap-1.5">
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
              <div className="flex min-w-0 flex-col gap-1.5">
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

          <p className="text-xs text-[hsl(var(--erp-fg-muted))] lg:pb-2">
            {periodLabel}
            {summary != null && (
              <>
                {" "}
                · {summary.remitosInScope} remitos en scope
              </>
            )}
          </p>
        </div>
      </header>

      {loading && !summary ? (
        <div className="flex flex-col items-center justify-center gap-3 py-24">
          <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--erp-accent))]" />
          <p className="text-sm text-[hsl(var(--erp-fg-muted))]">
            Cargando analytics…
          </p>
        </div>
      ) : error || !summary ? (
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
          <ErpAnalyticsKpiGrid totals={summary.totals} periodLabel={periodLabel} />

          <SectionCard title="Ventas por día" icon={Calendar}>
            <ErpAnalyticsSalesByDay salesByDay={summary.salesByDay} />
          </SectionCard>

          <SectionCard title="Top productos" icon={BarChart3}>
            <ErpAnalyticsTopProducts section={summary.topProducts} />
          </SectionCard>

          <ErpAnalyticsMetaSlot meta={summary.meta} />
        </>
      )}
    </div>
  );
}
