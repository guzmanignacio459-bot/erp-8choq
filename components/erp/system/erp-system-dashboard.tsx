"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  Server,
} from "lucide-react";

import { ErpDashboardLoading } from "@/components/erp/shared/erp-dashboard-loading";
import { createFetchGuard, isAbortError } from "@/lib/erp/fetch-guard";
import type {
  HealthCheckStatus,
  PipelineSystemHealthResponse,
} from "@/types/erp-v2-pipeline-health";

function statusBadge(status: string | null) {
  if (!status) return "—";
  const s = status.toLowerCase();
  if (s === "success" || s === "pass") return "PASS";
  if (s === "failed" || s === "fail") return "FAIL";
  if (s === "warning") return "WARN";
  return status.toUpperCase();
}

function statusColor(status: string | null): string {
  const s = (status ?? "").toLowerCase();
  if (s === "success" || s === "pass") return "text-[hsl(var(--erp-emerald))]";
  if (s === "failed" || s === "fail") return "text-[hsl(var(--erp-rose))]";
  if (s === "warning" || s === "warn") return "text-[hsl(var(--erp-amber))]";
  return "text-[hsl(var(--erp-fg-muted))]";
}

function KpiCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="erp-card rounded-lg p-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-[hsl(var(--erp-fg-subtle))]">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-[hsl(var(--erp-fg))]">
        {value}
      </p>
      {sub && (
        <p className="mt-1 text-xs text-[hsl(var(--erp-fg-muted))]">{sub}</p>
      )}
    </div>
  );
}

function HealthPill({ status }: { status: HealthCheckStatus | null }) {
  if (!status) return <span className="text-[hsl(var(--erp-fg-muted))]">—</span>;
  const Icon =
    status === "PASS"
      ? CheckCircle2
      : status === "WARNING"
        ? AlertCircle
        : AlertCircle;
  return (
    <span className={`inline-flex items-center gap-1.5 font-medium ${statusColor(status)}`}>
      <Icon className="h-4 w-4" />
      {status}
    </span>
  );
}

export function ErpSystemDashboard() {
  const [data, setData] = useState<PipelineSystemHealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v2/system/pipeline-health", { signal });
      const body = (await res.json()) as PipelineSystemHealthResponse;
      if (!res.ok || !body.ok) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setData(body);
    } catch (err) {
      if (isAbortError(err)) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const guard = createFetchGuard();
    const { signal } = guard.begin();
    load(signal);
    return () => guard.cancel();
  }, [load]);

  if (loading && !data) {
    return <ErpDashboardLoading label="Cargando sistema ERP V2…" />;
  }

  const latest = data?.latestRun;
  const kpis = data?.kpis24h;
  const health = data?.healthCheck;
  const pipelineStale = data?.pipelineStale;
  const paymentsPending = data?.paymentsPending;
  const transferAssignmentsPending = data?.transferAssignmentsPending;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[hsl(var(--erp-border))] bg-[hsl(var(--erp-bg-hover))] text-[hsl(var(--erp-accent))]">
              <Server className="h-4 w-4" />
            </div>
            <h1 className="text-xl font-semibold text-[hsl(var(--erp-fg))]">
              Sistema ERP V2
            </h1>
          </div>
          <p className="text-sm text-[hsl(var(--erp-fg-muted))]">
            Pipeline live, health checks y burn-in — staging Neon
          </p>
        </div>
        <button
          type="button"
          onClick={() => load()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-[hsl(var(--erp-border))] bg-[hsl(var(--erp-bg-card))] px-3 py-2 text-sm text-[hsl(var(--erp-fg))] hover:bg-[hsl(var(--erp-bg-hover))] disabled:opacity-60"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Actualizar
        </button>
      </div>

      {error && (
        <div className="erp-card flex items-start gap-3 border-[hsl(var(--erp-rose)/0.35)] p-4 text-sm text-[hsl(var(--erp-rose))]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {transferAssignmentsPending && transferAssignmentsPending.status === "FAIL" && (
        <div className="erp-card flex items-start gap-3 border-[hsl(var(--erp-rose)/0.45)] bg-[hsl(var(--erp-rose)/0.06)] p-4 text-sm text-[hsl(var(--erp-rose))]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Transfer Assignments Pending</p>
            <p className="mt-1 text-[hsl(var(--erp-fg-muted))]">
              {transferAssignmentsPending.count} transferencias TN sin cuenta financiera.
              Más antigua: {transferAssignmentsPending.oldestOrderId ?? "—"}
              {transferAssignmentsPending.lagHours != null
                ? ` (${transferAssignmentsPending.lagHours}h atraso, umbral ${transferAssignmentsPending.failThresholdHours}h)`
                : ""}
            </p>
          </div>
        </div>
      )}

      {paymentsPending && paymentsPending.status === "FAIL" && (
        <div className="erp-card flex items-start gap-3 border-[hsl(var(--erp-rose)/0.45)] bg-[hsl(var(--erp-rose)/0.06)] p-4 text-sm text-[hsl(var(--erp-rose))]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Payments Pending — MP sin sincronizar</p>
            <p className="mt-1 text-[hsl(var(--erp-fg-muted))]">
              {paymentsPending.count} órdenes MP pagadas sin fila en payments.
              Más antigua: {paymentsPending.oldestOrderId ?? "—"}
              {paymentsPending.lagHours != null
                ? ` (${paymentsPending.lagHours}h atraso, umbral ${paymentsPending.failThresholdHours}h)`
                : ""}
            </p>
          </div>
        </div>
      )}

      {pipelineStale?.stale && (
        <div className="erp-card flex items-start gap-3 border-[hsl(var(--erp-rose)/0.45)] bg-[hsl(var(--erp-rose)/0.06)] p-4 text-sm text-[hsl(var(--erp-rose))]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Pipeline stale — sin corrida reciente</p>
            <p className="mt-1 text-[hsl(var(--erp-fg-muted))]">
              Última corrida{" "}
              {pipelineStale.lastRunAt
                ? `hace ${pipelineStale.minutesSinceLastRun} min (${new Date(pipelineStale.lastRunAt).toLocaleString("es-AR")})`
                : "nunca registrada"}
              . Umbral: {pipelineStale.thresholdMinutes} min. Verificar GitHub
              Actions cron o ejecutar{" "}
              <code className="rounded bg-[hsl(var(--erp-bg-hover))] px-1 py-0.5 text-xs">
                m5:scheduler:once
              </code>
              .
            </p>
          </div>
        </div>
      )}

      <section className="erp-card p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-2">
          <Activity className="h-4 w-4 text-[hsl(var(--erp-accent))]" />
          <h2 className="text-sm font-semibold text-[hsl(var(--erp-fg))]">
            Última corrida
          </h2>
        </div>
        {latest ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs text-[hsl(var(--erp-fg-muted))]">Estado</p>
              <p className={`font-medium ${statusColor(latest.status)}`}>
                {statusBadge(latest.status)}
              </p>
            </div>
            <div>
              <p className="text-xs text-[hsl(var(--erp-fg-muted))]">Inicio</p>
              <p className="text-sm text-[hsl(var(--erp-fg))]">
                {new Date(latest.startedAt).toLocaleString("es-AR")}
              </p>
            </div>
            <div>
              <p className="text-xs text-[hsl(var(--erp-fg-muted))]">Duración</p>
              <p className="text-sm tabular-nums text-[hsl(var(--erp-fg))]">
                {latest.durationMs != null ? `${latest.durationMs} ms` : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-[hsl(var(--erp-fg-muted))]">Health</p>
              <HealthPill status={latest.healthStatus} />
            </div>
            <div>
              <p className="text-xs text-[hsl(var(--erp-fg-muted))]">Órdenes importadas</p>
              <p className="text-sm tabular-nums">{latest.ordersImported}</p>
            </div>
            <div>
              <p className="text-xs text-[hsl(var(--erp-fg-muted))]">Units creadas</p>
              <p className="text-sm tabular-nums">{latest.unitsCreated}</p>
            </div>
            <div>
              <p className="text-xs text-[hsl(var(--erp-fg-muted))]">Allocations comerciales</p>
              <p className="text-sm tabular-nums">{latest.commercialAllocationsCreated}</p>
            </div>
            <div>
              <p className="text-xs text-[hsl(var(--erp-fg-muted))]">MP allocations</p>
              <p className="text-sm tabular-nums">{latest.mpAllocationsCreated}</p>
            </div>
            <div>
              <p className="text-xs text-[hsl(var(--erp-fg-muted))]">Stock movements</p>
              <p className="text-sm tabular-nums">{latest.stockMovementsCreated}</p>
            </div>
            <div>
              <p className="text-xs text-[hsl(var(--erp-fg-muted))]">Projection</p>
              <p className={`text-sm font-medium ${statusColor(latest.projectionStatus)}`}>
                {latest.projectionStatus ?? "—"}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-[hsl(var(--erp-fg-muted))]">Sin corridas registradas.</p>
        )}
      </section>

      {kpis && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-[hsl(var(--erp-accent))]" />
            <h2 className="text-sm font-semibold text-[hsl(var(--erp-fg))]">
              KPIs últimas 24h
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <KpiCard label="Runs totales" value={kpis.totalRuns} />
            <KpiCard
              label="Success rate"
              value={`${(kpis.successRate * 100).toFixed(1)}%`}
              sub={`${kpis.successRuns} ok / ${kpis.failedRuns} fail`}
            />
            <KpiCard
              label="Duración promedio"
              value={`${kpis.avgDurationMs} ms`}
              sub={`máx ${kpis.maxDurationMs} ms`}
            />
            <KpiCard label="Órdenes importadas" value={kpis.ordersImported} />
            <KpiCard
              label="Payments Pending"
              value={paymentsPending?.count ?? "—"}
              sub={
                paymentsPending
                  ? `${paymentsPending.status}${paymentsPending.lagHours != null ? ` · ${paymentsPending.lagHours}h` : ""}`
                  : undefined
              }
            />
            <KpiCard
              label="Transfer Assignments"
              value={transferAssignmentsPending?.count ?? "—"}
              sub={
                transferAssignmentsPending
                  ? `${transferAssignmentsPending.status}${transferAssignmentsPending.lagHours != null ? ` · ${transferAssignmentsPending.lagHours}h` : ""}`
                  : undefined
              }
            />
            <KpiCard label="Warnings" value={kpis.warningsCount} />
          </div>
        </section>
      )}

      {health && (
        <section className="erp-card p-4 sm:p-5">
          <h2 className="mb-4 text-sm font-semibold text-[hsl(var(--erp-fg))]">
            Drift detection — {health.checkedAt}
          </h2>
          <div className="mb-3">
            <HealthPill status={health.overall} />
          </div>
          <ul className="space-y-2">
            {Object.values(health.checks).map((check) => (
              <li
                key={check.id}
                className="rounded-lg border border-[hsl(var(--erp-border-subtle))] px-3 py-2 text-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium uppercase text-[hsl(var(--erp-fg))]">
                    {check.id}
                  </span>
                  <span className={statusColor(check.pass ? "pass" : "fail")}>
                    {check.pass ? "PASS" : "FAIL"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-[hsl(var(--erp-fg-muted))]">
                  {check.message}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data?.recentRuns && data.recentRuns.length > 0 && (
        <section className="erp-card overflow-x-auto p-4 sm:p-5">
          <h2 className="mb-4 text-sm font-semibold text-[hsl(var(--erp-fg))]">
            Historial reciente
          </h2>
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-[hsl(var(--erp-border))] text-xs uppercase tracking-wide text-[hsl(var(--erp-fg-subtle))]">
                <th className="pb-2 pr-4">Inicio</th>
                <th className="pb-2 pr-4">Estado</th>
                <th className="pb-2 pr-4">Duración</th>
                <th className="pb-2 pr-4">Import</th>
                <th className="pb-2 pr-4">Units</th>
                <th className="pb-2 pr-4">Stock</th>
                <th className="pb-2 pr-4">Health</th>
              </tr>
            </thead>
            <tbody>
              {data.recentRuns.map((run) => (
                <tr
                  key={run.id}
                  className="border-b border-[hsl(var(--erp-border-subtle))] last:border-0"
                >
                  <td className="py-2 pr-4 text-[hsl(var(--erp-fg-muted))]">
                    {new Date(run.startedAt).toLocaleString("es-AR")}
                  </td>
                  <td className={`py-2 pr-4 ${statusColor(run.status)}`}>
                    {statusBadge(run.status)}
                  </td>
                  <td className="py-2 pr-4 tabular-nums">{run.durationMs ?? "—"}</td>
                  <td className="py-2 pr-4 tabular-nums">{run.ordersImported}</td>
                  <td className="py-2 pr-4 tabular-nums">{run.unitsCreated}</td>
                  <td className="py-2 pr-4 tabular-nums">{run.stockMovementsCreated}</td>
                  <td className={`py-2 pr-4 ${statusColor(run.healthStatus)}`}>
                    {run.healthStatus ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {data?.fetchedAt && (
        <p className="text-center text-[11px] text-[hsl(var(--erp-fg-subtle))]">
          Actualizado {new Date(data.fetchedAt).toLocaleString("es-AR")}
        </p>
      )}
    </div>
  );
}
