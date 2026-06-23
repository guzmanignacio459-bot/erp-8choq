"use client";

import { useCallback, useState } from "react";
import { AlertCircle, Download } from "lucide-react";

import { ErpImportacionesForm } from "@/components/erp/importaciones/erp-importaciones-form";
import { ErpImportacionesResult } from "@/components/erp/importaciones/erp-importaciones-result";
import type {
  ErpOrdersImportRequestBody,
  ErpOrdersImportResponse,
} from "@/types/erp";

export function ErpImportacionesDashboard() {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ErpOrdersImportResponse | null>(null);

  const handleSubmit = useCallback(async (payload: ErpOrdersImportRequestBody) => {
    setRunning(true);
    setError(null);

    try {
      const res = await fetch("/api/erp/orders/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = (await res.json()) as ErpOrdersImportResponse;
      setResult(json);

      if (!json.ok) {
        setError(json.error ?? `Error HTTP ${res.status}`);
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      setResult(null);
    } finally {
      setRunning(false);
    }
  }, []);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[hsl(var(--erp-border))] bg-[hsl(var(--erp-accent)/0.1)] text-[hsl(var(--erp-accent))]">
            <Download className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-[hsl(var(--erp-fg))] sm:text-2xl">
              Importaciones
            </h1>
            <p className="text-xs text-[hsl(var(--erp-fg-muted))] sm:text-sm">
              Tiendanube → REMITOS · transición desde curl manual
            </p>
          </div>
        </div>
        <p className="max-w-2xl text-xs leading-relaxed text-[hsl(var(--erp-fg-muted))]">
          Importá órdenes pagadas por fecha o rango. Próximo paso: webhook o cron
          incremental — por ahora operación manual desde acá para ponerte al día
          histórico con estabilidad.
        </p>
      </header>

      {error ? (
        <div className="erp-card flex items-start gap-3 border-rose-500/25 bg-rose-500/5 px-4 py-3">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" />
          <p className="text-sm text-rose-300">{error}</p>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr] lg:items-start">
        <ErpImportacionesForm running={running} onSubmit={handleSubmit} />
        <ErpImportacionesResult result={result} running={running} />
      </div>
    </div>
  );
}
