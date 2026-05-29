"use client";

import { ChevronDown, Clock, Copy, CheckCircle2, XCircle } from "lucide-react";

import { formatAnalyticsCount } from "@/lib/erp/analytics-format";
import { cn } from "@/lib/utils";
import type { ErpOrdersImportResponse } from "@/types/erp";

type ErpImportacionesResultProps = {
  result: ErpOrdersImportResponse | null;
  running: boolean;
};

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  const sec = Math.round(ms / 100) / 10;
  return sec >= 60 ? `${Math.floor(sec / 60)}m ${Math.round(sec % 60)}s` : `${sec}s`;
}

function MetricCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: "cyan" | "emerald" | "amber" | "rose" | "violet" | "blue";
}) {
  const accentClass =
    accent === "emerald"
      ? "erp-kpi-accent-emerald"
      : accent === "amber"
        ? "erp-kpi-accent-amber"
        : accent === "rose"
          ? "erp-kpi-accent-rose"
          : accent === "violet"
            ? "erp-kpi-accent-violet"
            : accent === "blue"
              ? "erp-kpi-accent-blue"
              : "erp-kpi-accent-cyan";

  return (
    <article
      className={cn(
        "erp-card erp-card-glow relative p-4 sm:p-5",
        accentClass
      )}
    >
      <p className="text-[10px] font-medium uppercase tracking-wider text-[hsl(var(--erp-fg-muted))]">
        {label}
      </p>
      <p className="mt-2 text-lg font-semibold text-[hsl(var(--erp-fg))] sm:text-xl">
        {value}
      </p>
      {hint ? (
        <p className="mt-2 text-[10px] text-[hsl(var(--erp-fg-muted))]">
          {hint}
        </p>
      ) : null}
    </article>
  );
}

export function ErpImportacionesResult({
  result,
  running,
}: ErpImportacionesResultProps) {
  if (running) {
    return (
      <div className="erp-card flex flex-col items-center gap-3 px-6 py-12 text-center">
        <Clock className="h-8 w-8 animate-pulse text-[hsl(var(--erp-accent))]" />
        <p className="text-sm font-medium text-[hsl(var(--erp-fg))]">
          Importando órdenes…
        </p>
        <p className="max-w-md text-xs text-[hsl(var(--erp-fg-muted))]">
          Puede tardar varios minutos según el rango y la cantidad de órdenes.
        </p>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="erp-card border-dashed px-6 py-10 text-center">
        <p className="text-sm text-[hsl(var(--erp-fg-muted))]">
          Ejecutá un import para ver métricas operativas y la respuesta raw.
        </p>
      </div>
    );
  }

  const { metrics, ok, error, mode, elapsedMs, slots, errors } = result;
  const rawJson = JSON.stringify(result.raw, null, 2);

  return (
    <div className="space-y-4">
      <div
        className={cn(
          "erp-card flex items-start gap-3 px-4 py-3 sm:px-5",
          ok
            ? "border-emerald-500/25 bg-emerald-500/5"
            : "border-rose-500/25 bg-rose-500/5"
        )}
      >
        {ok ? (
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
        ) : (
          <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" />
        )}
        <div className="min-w-0">
          <p className="text-sm font-medium text-[hsl(var(--erp-fg))]">
            {ok ? "Import completado" : "Import con errores"}
          </p>
          <p className="mt-1 text-xs text-[hsl(var(--erp-fg-muted))]">
            Modo {mode} · {formatElapsed(elapsedMs)}
            {result.input.dryRun ? " · dry run" : " · escritura real"}
          </p>
          {error ? (
            <p className="mt-2 text-xs text-rose-400">{error}</p>
          ) : null}
          {result.message ? (
            <p className="mt-1 text-xs text-[hsl(var(--erp-fg-muted))]">
              {result.message}
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        <MetricCard
          label="Importadas"
          value={formatAnalyticsCount(metrics.imported)}
          accent="emerald"
        />
        <MetricCard
          label="Duplicadas"
          value={formatAnalyticsCount(metrics.duplicated)}
          accent="amber"
        />
        <MetricCard
          label="Skipped"
          value={formatAnalyticsCount(metrics.skipped)}
          hint="En rango sin import"
          accent="violet"
        />
        <MetricCard
          label="Errores"
          value={formatAnalyticsCount(metrics.errorsCount)}
          accent="rose"
        />
        <MetricCard
          label="Consideradas pagadas"
          value={formatAnalyticsCount(metrics.consideredPaid)}
          accent="blue"
        />
        <MetricCard
          label="En rango"
          value={formatAnalyticsCount(metrics.consideredInRange)}
          accent="cyan"
        />
        <MetricCard
          label="Would import"
          value={formatAnalyticsCount(metrics.wouldImport)}
          hint="Payload válido"
          accent="violet"
        />
        <MetricCard
          label="Elapsed"
          value={formatElapsed(elapsedMs)}
          accent="blue"
        />
      </div>

      {slots && slots.length > 0 ? (
        <div className="erp-card overflow-hidden">
          <div className="border-b border-[hsl(var(--erp-border))] px-4 py-3 sm:px-5">
            <p className="text-sm font-medium text-[hsl(var(--erp-fg))]">
              Franjas horarias
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-xs">
              <thead>
                <tr className="border-b border-[hsl(var(--erp-border-subtle))] text-[hsl(var(--erp-fg-muted))]">
                  <th className="px-4 py-2 font-medium sm:px-5">Franja</th>
                  <th className="px-4 py-2 font-medium">Importadas</th>
                  <th className="px-4 py-2 font-medium">Dup.</th>
                  <th className="px-4 py-2 font-medium">Errores</th>
                  <th className="px-4 py-2 font-medium">Tiempo</th>
                  <th className="px-4 py-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {slots.map((slot) => (
                  <tr
                    key={`${slot.label}-${slot.fromISO}`}
                    className="border-b border-[hsl(var(--erp-border-subtle))] last:border-0"
                  >
                    <td className="px-4 py-2.5 text-[hsl(var(--erp-fg))] sm:px-5">
                      {slot.label}
                    </td>
                    <td className="px-4 py-2.5">{slot.metrics.imported}</td>
                    <td className="px-4 py-2.5">{slot.metrics.duplicated}</td>
                    <td className="px-4 py-2.5">{slot.metrics.errorsCount}</td>
                    <td className="px-4 py-2.5">{formatElapsed(slot.elapsedMs)}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase",
                          slot.ok
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-rose-500/15 text-rose-400"
                        )}
                      >
                        {slot.ok ? "OK" : "Fail"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {errors.length > 0 ? (
        <div className="erp-card overflow-hidden">
          <div className="border-b border-[hsl(var(--erp-border))] px-4 py-3 sm:px-5">
            <p className="text-sm font-medium text-[hsl(var(--erp-fg))]">
              Errores ({errors.length})
            </p>
          </div>
          <ul className="max-h-48 divide-y divide-[hsl(var(--erp-border-subtle))] overflow-y-auto text-xs">
            {errors.slice(0, 50).map((err, i) => (
              <li
                key={`${err.step}-${err.orderId ?? i}`}
                className="px-4 py-2.5 text-[hsl(var(--erp-fg-muted))] sm:px-5"
              >
                <span className="font-medium text-[hsl(var(--erp-fg))]">
                  {err.orderId ? `#${err.orderId} · ` : ""}
                  {err.step}
                </span>
                {" — "}
                {err.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <details className="erp-card group overflow-hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 sm:px-5 [&::-webkit-details-marker]:hidden">
          <span className="text-sm font-medium text-[hsl(var(--erp-fg))]">
            Raw response (import-orders)
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-[hsl(var(--erp-fg-muted))] transition group-open:rotate-180" />
        </summary>
        <div className="relative border-t border-[hsl(var(--erp-border))]">
          <button
            type="button"
            className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-md border border-[hsl(var(--erp-border))] bg-[hsl(var(--erp-bg-card))] px-2 py-1 text-[10px] text-[hsl(var(--erp-fg-muted))] hover:text-[hsl(var(--erp-fg))]"
            onClick={() => void navigator.clipboard.writeText(rawJson)}
          >
            <Copy className="h-3 w-3" />
            Copiar
          </button>
          <pre className="max-h-96 overflow-auto p-4 pt-10 text-[11px] leading-relaxed text-[hsl(var(--erp-fg-muted))] sm:px-5">
            {rawJson}
          </pre>
        </div>
      </details>
    </div>
  );
}
