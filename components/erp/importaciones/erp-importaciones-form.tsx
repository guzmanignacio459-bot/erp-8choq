"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Calendar,
  CalendarRange,
  ChevronDown,
  Loader2,
  Play,
  Zap,
} from "lucide-react";

import type { ErpOrdersImportPreset, ErpOrdersImportRequestBody } from "@/types/erp";

const inputClass =
  "h-10 w-full rounded-lg border border-[hsl(var(--erp-border))] bg-[hsl(var(--erp-bg-card))] px-3 text-sm text-[hsl(var(--erp-fg))] focus:border-[hsl(var(--erp-accent)/0.5)] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--erp-accent)/0.35)]";

const labelClass =
  "text-[10px] font-medium uppercase tracking-wider text-[hsl(var(--erp-fg-muted))]";

type ImportMode = "today" | "yesterday" | "singleDay" | "custom";

export type ErpImportacionesSubmitPayload = ErpOrdersImportRequestBody;

type ErpImportacionesFormProps = {
  running: boolean;
  onSubmit: (payload: ErpImportacionesSubmitPayload) => void;
};

function formatTodayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function ErpImportacionesForm({
  running,
  onSubmit,
}: ErpImportacionesFormProps) {
  const [mode, setMode] = useState<ImportMode>("yesterday");
  const [specificDate, setSpecificDate] = useState(formatTodayIso());
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [singleOrderId, setSingleOrderId] = useState("");
  const [useHourlySlots, setUseHourlySlots] = useState(false);
  const [slotHours, setSlotHours] = useState(6);
  const [dryRun, setDryRun] = useState(true);
  const [importMp, setImportMp] = useState(false);
  const [mpForce, setMpForce] = useState(false);
  const [fetchDetails, setFetchDetails] = useState(false);
  const [perPage, setPerPage] = useState(50);
  const [maxPages, setMaxPages] = useState(50);
  const [throttleMs, setThrottleMs] = useState(350);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const hourlyEligible = useMemo(() => {
    if (mode === "today" || mode === "yesterday" || mode === "singleDay") {
      return !singleOrderId.trim();
    }
    if (mode === "custom") {
      const f = customFrom.trim();
      const t = customTo.trim();
      return f && t && f === t && !singleOrderId.trim();
    }
    return false;
  }, [mode, customFrom, customTo, singleOrderId]);

  const buildPayload = useCallback((): ErpImportacionesSubmitPayload => {
    const presetMap: Record<ImportMode, ErpOrdersImportPreset> = {
      today: "today",
      yesterday: "yesterday",
      singleDay: "singleDay",
      custom: "custom",
    };

    const payload: ErpImportacionesSubmitPayload = {
      preset: presetMap[mode],
      dryRun,
      importMp,
      mpForce,
      fetchDetails,
      perPage,
      maxPages,
      throttleMs,
    };

    if (mode === "singleDay") payload.date = specificDate.trim();
    if (mode === "custom") {
      payload.from = customFrom.trim();
      payload.to = customTo.trim();
    }

    const orderId = singleOrderId.trim();
    if (orderId) payload.singleOrderId = orderId;

    if (useHourlySlots && hourlyEligible) {
      payload.useHourlySlots = true;
      payload.slotHours = slotHours;
    }

    return payload;
  }, [
    mode,
    specificDate,
    customFrom,
    customTo,
    singleOrderId,
    useHourlySlots,
    hourlyEligible,
    slotHours,
    dryRun,
    importMp,
    mpForce,
    fetchDetails,
    perPage,
    maxPages,
    throttleMs,
  ]);

  const handleSubmit = useCallback(() => {
    const payload = buildPayload();

    if (mode === "custom" && (!payload.from || !payload.to)) {
      window.alert("Completá fecha desde y hasta para el rango personalizado.");
      return;
    }

    if (mode === "singleDay" && !payload.date) {
      window.alert("Indicá la fecha específica.");
      return;
    }

    if (!payload.dryRun) {
      const ok = window.confirm(
        "Vas a escribir remitos en la hoja (dry run desactivado). ¿Continuar?"
      );
      if (!ok) return;
    }

    onSubmit(payload);
  }, [buildPayload, mode, onSubmit]);

  return (
    <div className="erp-card space-y-5 p-4 sm:p-6">
      <div>
        <h2 className="text-sm font-semibold text-[hsl(var(--erp-fg))]">
          Rango de importación
        </h2>
        <p className="mt-1 text-xs text-[hsl(var(--erp-fg-muted))]">
          Reemplaza curl manual — tokens solo en servidor.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: "today" as const, label: "Importar hoy", icon: Zap },
            { id: "yesterday" as const, label: "Importar ayer", icon: Calendar },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            disabled={running}
            onClick={() => setMode(id)}
            className={
              mode === id
                ? "inline-flex items-center gap-2 rounded-lg border border-[hsl(var(--erp-accent)/0.45)] bg-[hsl(var(--erp-accent)/0.12)] px-3 py-2 text-xs font-medium text-[hsl(var(--erp-accent))]"
                : "inline-flex items-center gap-2 rounded-lg border border-[hsl(var(--erp-border))] bg-[hsl(var(--erp-bg-card))] px-3 py-2 text-xs text-[hsl(var(--erp-fg-muted))] hover:text-[hsl(var(--erp-fg))]"
            }
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className={labelClass}>Modo</span>
          <select
            className={inputClass}
            value={mode}
            disabled={running}
            onChange={(e) => setMode(e.target.value as ImportMode)}
          >
            <option value="today">Hoy</option>
            <option value="yesterday">Ayer</option>
            <option value="singleDay">Fecha específica</option>
            <option value="custom">Rango personalizado</option>
          </select>
        </label>

        {mode === "singleDay" ? (
          <label className="block space-y-1.5">
            <span className={labelClass}>Fecha</span>
            <input
              type="date"
              className={inputClass}
              value={specificDate}
              disabled={running}
              onChange={(e) => setSpecificDate(e.target.value)}
            />
          </label>
        ) : null}

        {mode === "custom" ? (
          <>
            <label className="block space-y-1.5">
              <span className={labelClass}>Desde</span>
              <input
                type="date"
                className={inputClass}
                value={customFrom}
                disabled={running}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
            </label>
            <label className="block space-y-1.5">
              <span className={labelClass}>Hasta</span>
              <input
                type="date"
                className={inputClass}
                value={customTo}
                disabled={running}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </label>
          </>
        ) : null}

        <label className="block space-y-1.5 sm:col-span-2">
          <span className={labelClass}>Orden puntual (opcional)</span>
          <input
            type="text"
            className={inputClass}
            placeholder="TN order ID"
            value={singleOrderId}
            disabled={running}
            onChange={(e) => setSingleOrderId(e.target.value)}
          />
        </label>
      </div>

      <div className="rounded-lg border border-[hsl(var(--erp-border-subtle))] bg-[hsl(var(--erp-bg-elevated)/0.35)] p-3">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            className="mt-1"
            checked={useHourlySlots}
            disabled={running || !hourlyEligible}
            onChange={(e) => setUseHourlySlots(e.target.checked)}
          />
          <span>
            <span className="flex items-center gap-1.5 text-sm font-medium text-[hsl(var(--erp-fg))]">
              <CalendarRange className="h-3.5 w-3.5" />
              Franjas horarias (días pesados)
            </span>
            <span className="mt-1 block text-xs text-[hsl(var(--erp-fg-muted))]">
              Divide un solo día en bloques y ejecuta import-orders por franja.
              {!hourlyEligible
                ? " Disponible solo para un día (sin orden puntual)."
                : ""}
            </span>
          </span>
        </label>
        {useHourlySlots && hourlyEligible ? (
          <label className="mt-3 block max-w-[140px] space-y-1.5 pl-7">
            <span className={labelClass}>Horas / franja</span>
            <input
              type="number"
              min={1}
              max={12}
              className={inputClass}
              value={slotHours}
              disabled={running}
              onChange={(e) => setSlotHours(Number(e.target.value) || 6)}
            />
          </label>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        <label className="inline-flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={dryRun}
            disabled={running}
            onChange={(e) => setDryRun(e.target.checked)}
          />
          <span className="text-[hsl(var(--erp-fg))]">dryRun</span>
        </label>
        <label className="inline-flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={importMp}
            disabled={running}
            onChange={(e) => setImportMp(e.target.checked)}
          />
          <span className="text-[hsl(var(--erp-fg))]">importMp</span>
        </label>
        <label className="inline-flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={mpForce}
            disabled={running || !importMp}
            onChange={(e) => setMpForce(e.target.checked)}
          />
          <span className="text-[hsl(var(--erp-fg-muted))]">mpForce</span>
        </label>
      </div>

      <button
        type="button"
        className="flex w-full items-center justify-center gap-2 text-xs text-[hsl(var(--erp-fg-muted))] hover:text-[hsl(var(--erp-fg))] sm:w-auto"
        onClick={() => setAdvancedOpen((v) => !v)}
      >
        Opciones avanzadas
        <ChevronDown
          className={`h-3.5 w-3.5 transition ${advancedOpen ? "rotate-180" : ""}`}
        />
      </button>

      {advancedOpen ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={fetchDetails}
              disabled={running}
              onChange={(e) => setFetchDetails(e.target.checked)}
            />
            fetchDetails
          </label>
          <label className="block space-y-1">
            <span className={labelClass}>perPage</span>
            <input
              type="number"
              className={inputClass}
              value={perPage}
              disabled={running}
              onChange={(e) => setPerPage(Number(e.target.value) || 50)}
            />
          </label>
          <label className="block space-y-1">
            <span className={labelClass}>maxPages</span>
            <input
              type="number"
              className={inputClass}
              value={maxPages}
              disabled={running}
              onChange={(e) => setMaxPages(Number(e.target.value) || 50)}
            />
          </label>
          <label className="block space-y-1 sm:col-span-3 sm:max-w-xs">
            <span className={labelClass}>throttleMs</span>
            <input
              type="number"
              className={inputClass}
              value={throttleMs}
              disabled={running}
              onChange={(e) => setThrottleMs(Number(e.target.value) || 0)}
            />
          </label>
        </div>
      ) : null}

      <button
        type="button"
        disabled={running}
        onClick={handleSubmit}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[hsl(252_95%_68%)] to-[hsl(187_85%_53%)] px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/20 disabled:opacity-60 sm:w-auto"
      >
        {running ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Play className="h-4 w-4" />
        )}
        {running ? "Importando…" : dryRun ? "Ejecutar dry run" : "Importar órdenes"}
      </button>
    </div>
  );
}
