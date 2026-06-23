/**
 * Servicio ERP — remitos (solo lectura vía Apps Script existente).
 * Intenta listRemitosFull (hoja REMITOS completa) y hace fallback a listRemitos.
 */

import {
  buildGasAttemptErrorDebug,
  buildRemitosDebugSnapshot,
  logRemitosDebug,
  type ErpRemitosDebugSnapshot,
  type ErpRemitosGasAttemptError,
} from "@/lib/erp/remitos-debug";
import { mapRowToErpRemito } from "@/lib/erp/remitos-mapper";
import type { ErpRemito } from "@/types/erp";

export { mapRowToErpRemito } from "@/lib/erp/remitos-mapper";

const GAS_URL = (process.env.APPS_SCRIPT_URL ?? "").trim();
const GAS_TOKEN = (process.env.APPS_SCRIPT_TOKEN ?? "").trim();
const FETCH_TIMEOUT_MS = 12_000;

/** auto | full | summary */
const LIST_MODE = (process.env.ERP_REMITOS_LIST_MODE ?? "auto")
  .trim()
  .toLowerCase();

const GAS_ACTION_FULL = "listRemitosFull";
const GAS_ACTION_SUMMARY = "listRemitos";

type GasListPayload = {
  ok?: boolean;
  data?: unknown[];
  remitos?: unknown[];
  error?: string;
};

type GasCallResult = {
  action: string;
  ok: boolean;
  payload: GasListPayload;
  rows: unknown[];
  error?: string;
  httpStatus: number;
  rawResponseText?: string;
};

export type FetchErpRemitosResult =
  | {
      ok: true;
      data: ErpRemito[];
      listActionUsed: string;
      debug?: ErpRemitosDebugSnapshot;
    }
  | { ok: false; error: string; debug?: ErpRemitosDebugSnapshot };

function extractRowsFromGasPayload(payload: GasListPayload): unknown[] {
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.remitos)) return payload.remitos;
  return [];
}

function isUnknownGasActionError(message: string): boolean {
  const e = message.toLowerCase();
  return (
    e.includes("unknown action") ||
    e.includes("acción desconocida") ||
    e.includes("accion desconocida") ||
    e.includes("acción no soportada") ||
    e.includes("accion no soportada") ||
    e.includes("no soportada") ||
    e.includes("not supported") ||
    e.includes("no válida") ||
    e.includes("no valida") ||
    e.includes("not found") ||
    e.includes("invalid action") ||
    e.includes("unsupported action") ||
    (e.includes("action") && e.includes("invalid"))
  );
}

async function callGasListAction(
  action: string,
  q: string,
  signal: AbortSignal
): Promise<GasCallResult> {
  const res = await fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    signal,
    body: JSON.stringify({
      action,
      q,
      token: GAS_TOKEN,
    }),
  });

  const text = await res.text();
  let payload: GasListPayload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    return {
      action,
      ok: false,
      payload: {},
      rows: [],
      error: `Respuesta no JSON: ${text.slice(0, 200)}`,
      httpStatus: res.status,
      rawResponseText: text,
    };
  }

  const rows = extractRowsFromGasPayload(payload);
  const gasOk = res.ok && payload.ok !== false;

  return {
    action,
    ok: gasOk,
    payload,
    rows,
    error: gasOk ? undefined : String(payload.error ?? `HTTP ${res.status}`),
    httpStatus: res.status,
    rawResponseText: text,
  };
}

function toFallbackAttemptError(result: GasCallResult): ErpRemitosGasAttemptError {
  return buildGasAttemptErrorDebug({
    action: result.action,
    httpStatus: result.httpStatus,
    error: result.error,
    payload: result.payload as Record<string, unknown>,
    rawResponseText: result.rawResponseText,
  });
}

type ResolvedGasRows = {
  listActionUsed: string;
  attemptedActions: string[];
  fallbackFrom?: string;
  fallbackAttemptError?: ErpRemitosGasAttemptError;
  payload: GasListPayload;
  rows: unknown[];
};

async function resolveGasRemitosRows(
  q: string,
  signal: AbortSignal,
  mode: "auto" | "full" | "summary"
): Promise<ResolvedGasRows | { error: string; attemptedActions: string[] }> {
  const attemptedActions: string[] = [];

  if (mode === "summary") {
    attemptedActions.push(GAS_ACTION_SUMMARY);
    const summary = await callGasListAction(GAS_ACTION_SUMMARY, q, signal);
    if (!summary.ok) {
      return { error: summary.error ?? "listRemitos falló", attemptedActions };
    }
    return {
      listActionUsed: GAS_ACTION_SUMMARY,
      attemptedActions,
      payload: summary.payload,
      rows: summary.rows,
    };
  }

  if (mode === "full" || mode === "auto") {
    attemptedActions.push(GAS_ACTION_FULL);
    const full = await callGasListAction(GAS_ACTION_FULL, q, signal);

    if (full.ok) {
      return {
        listActionUsed: GAS_ACTION_FULL,
        attemptedActions,
        payload: full.payload,
        rows: full.rows,
      };
    }

    const fullError = full.error ?? "";
    const shouldFallback =
      mode === "auto" && isUnknownGasActionError(fullError);

    if (!shouldFallback) {
      return {
        error: fullError || "listRemitosFull falló",
        attemptedActions,
      };
    }

    attemptedActions.push(GAS_ACTION_SUMMARY);
    const summary = await callGasListAction(GAS_ACTION_SUMMARY, q, signal);
    if (!summary.ok) {
      return {
        error: summary.error ?? "listRemitos falló tras fallback",
        attemptedActions,
      };
    }

    return {
      listActionUsed: GAS_ACTION_SUMMARY,
      attemptedActions,
      fallbackFrom: GAS_ACTION_FULL,
      fallbackAttemptError: toFallbackAttemptError(full),
      payload: summary.payload,
      rows: summary.rows,
    };
  }

  return { error: "Modo de listado inválido", attemptedActions };
}

function resolveListMode(
  queryMode?: string | null
): "auto" | "full" | "summary" {
  const q = (queryMode ?? "").trim().toLowerCase();
  if (q === "full" || q === "summary" || q === "auto") return q;
  if (LIST_MODE === "full" || LIST_MODE === "summary") return LIST_MODE;
  return "auto";
}

/**
 * Lista remitos — read-only.
 * @param options.mode — query ?mode=full|summary|auto (default auto)
 */
export async function fetchErpRemitosList(options?: {
  q?: string;
  signal?: AbortSignal;
  debug?: boolean;
  mode?: string | null;
}): Promise<FetchErpRemitosResult> {
  const debugMode = options?.debug === true;
  const q = options?.q?.trim() ?? "";
  const listMode = resolveListMode(options?.mode);

  if (!GAS_URL) {
    return { ok: false, error: "APPS_SCRIPT_URL no configurada en el servidor." };
  }

  try {
    new URL(GAS_URL);
  } catch {
    return { ok: false, error: "APPS_SCRIPT_URL inválida." };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  if (options?.signal) {
    if (options.signal.aborted) {
      clearTimeout(timeoutId);
      return { ok: false, error: "Solicitud cancelada." };
    }
    options.signal.addEventListener("abort", () => controller.abort(), {
      once: true,
    });
  }

  try {
    const resolved = await resolveGasRemitosRows(
      q,
      controller.signal,
      listMode
    );

    clearTimeout(timeoutId);

    if ("error" in resolved) {
      const debugSnapshot = debugMode
        ? buildRemitosDebugSnapshot(
            {},
            [],
            [],
            {
              listActionUsed: "none",
              attemptedActions: resolved.attemptedActions,
            }
          )
        : undefined;
      if (debugSnapshot) logRemitosDebug(debugSnapshot);
      return { ok: false, error: resolved.error, debug: debugSnapshot };
    }

    const data = resolved.rows
      .map(mapRowToErpRemito)
      .filter((row): row is ErpRemito => row !== null);

    let debugSnapshot: ErpRemitosDebugSnapshot | undefined;
    if (debugMode) {
      debugSnapshot = buildRemitosDebugSnapshot(
        resolved.payload as Record<string, unknown>,
        resolved.rows,
        data,
        {
          listActionUsed: resolved.listActionUsed,
          attemptedActions: resolved.attemptedActions,
          fallbackFrom: resolved.fallbackFrom,
          fallbackAttemptError: resolved.fallbackAttemptError,
        }
      );
      logRemitosDebug(debugSnapshot);
    }

    return {
      ok: true,
      data,
      listActionUsed: resolved.listActionUsed,
      debug: debugSnapshot,
    };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, error: "Timeout consultando Apps Script." };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
