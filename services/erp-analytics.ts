/**
 * Servicio ERP Analytics — read-only.
 * Cascada: getAnalyticsSummary (GAS) → fallback listRemitosFull + aggregator Next.
 */

import {
  aggregateAnalyticsFromRemitos,
  filterRemitosForAnalytics,
} from "@/lib/erp/analytics-aggregator";
import { mapGasAnalyticsSummary } from "@/lib/erp/analytics-mapper";
import { fetchErpRemitosList } from "@/services/erp-remitos";
import type { ErpAnalyticsSummary } from "@/types/erp";

const GAS_URL = (process.env.APPS_SCRIPT_URL ?? "").trim();
const GAS_TOKEN = (process.env.APPS_SCRIPT_TOKEN ?? "").trim();
const FETCH_TIMEOUT_MS = 30_000;

const GAS_ACTION_ANALYTICS = "getAnalyticsSummary";

type GasAnalyticsPayload = {
  ok?: boolean;
  data?: unknown;
  error?: string;
};

export type FetchErpAnalyticsResult =
  | {
      ok: true;
      data: ErpAnalyticsSummary;
      gasActionUsed: string;
      attemptedActions: string[];
    }
  | {
      ok: false;
      error: string;
      attemptedActions: string[];
    };

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
    e.includes("acción inválida") ||
    e.includes("accion invalida") ||
    e.includes("invalid action") ||
    e.includes("unsupported action")
  );
}

async function callGasAnalyticsSummary(
  from: string | undefined,
  to: string | undefined,
  signal: AbortSignal
): Promise<{
  ok: boolean;
  payload: GasAnalyticsPayload;
  error?: string;
  httpStatus: number;
}> {
  const res = await fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    signal,
    body: JSON.stringify({
      action: GAS_ACTION_ANALYTICS,
      from: from || undefined,
      to: to || undefined,
      token: GAS_TOKEN,
    }),
  });

  const text = await res.text();
  let payload: GasAnalyticsPayload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    return {
      ok: false,
      payload: {},
      error: `Respuesta no JSON: ${text.slice(0, 200)}`,
      httpStatus: res.status,
    };
  }

  const gasOk = res.ok && payload.ok !== false && payload.data != null;

  return {
    ok: gasOk,
    payload,
    error: gasOk
      ? undefined
      : String(payload.error ?? `HTTP ${res.status}`),
    httpStatus: res.status,
  };
}

async function fetchAnalyticsViaRemitosFallback(
  from: string | undefined,
  to: string | undefined,
  signal: AbortSignal,
  attemptedActions: string[]
): Promise<FetchErpAnalyticsResult> {
  attemptedActions.push("listRemitosFull");

  const listResult = await fetchErpRemitosList({
    mode: "full",
    signal,
  });

  if (!listResult.ok) {
    return {
      ok: false,
      error: listResult.error,
      attemptedActions,
    };
  }

  const filtered = filterRemitosForAnalytics(listResult.data, from, to);
  const data = aggregateAnalyticsFromRemitos(filtered, {
    analyticsSource: "listRemitosFull-fallback",
  });

  return {
    ok: true,
    data,
    gasActionUsed: listResult.listActionUsed ?? "listRemitosFull",
    attemptedActions,
  };
}

export async function fetchErpAnalytics(options?: {
  from?: string;
  to?: string;
  signal?: AbortSignal;
}): Promise<FetchErpAnalyticsResult> {
  const from = options?.from?.trim();
  const to = options?.to?.trim();
  const attemptedActions: string[] = [];

  if (!GAS_URL) {
    return {
      ok: false,
      error: "APPS_SCRIPT_URL no configurada en el servidor.",
      attemptedActions,
    };
  }

  try {
    new URL(GAS_URL);
  } catch {
    return {
      ok: false,
      error: "APPS_SCRIPT_URL inválida.",
      attemptedActions,
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  if (options?.signal) {
    if (options.signal.aborted) {
      clearTimeout(timeoutId);
      return { ok: false, error: "Solicitud cancelada.", attemptedActions };
    }
    options.signal.addEventListener("abort", () => controller.abort(), {
      once: true,
    });
  }

  try {
    attemptedActions.push(GAS_ACTION_ANALYTICS);
    const gasResult = await callGasAnalyticsSummary(
      from,
      to,
      controller.signal
    );

    if (gasResult.ok) {
      const mapped = mapGasAnalyticsSummary(gasResult.payload);
      clearTimeout(timeoutId);

      if (mapped) {
        const rawData = gasResult.payload.data;
        if (rawData && typeof rawData === "object") {
          const log = (rawData as Record<string, unknown>)._log;
          if (log && typeof log === "object") {
            console.log("[erp/analytics] GAS summary", log);
          }
        }
        return {
          ok: true,
          data: mapped,
          gasActionUsed: GAS_ACTION_ANALYTICS,
          attemptedActions,
        };
      }
    }

    const gasError = gasResult.error ?? "";
    const shouldFallback = !gasResult.ok && isUnknownGasActionError(gasError);

    if (!shouldFallback && gasResult.ok) {
      clearTimeout(timeoutId);
      return {
        ok: false,
        error: "Respuesta getAnalyticsSummary inválida.",
        attemptedActions,
      };
    }

    if (!shouldFallback && !gasResult.ok) {
      clearTimeout(timeoutId);
      return {
        ok: false,
        error: gasError || "getAnalyticsSummary falló",
        attemptedActions,
      };
    }

    clearTimeout(timeoutId);
    return fetchAnalyticsViaRemitosFallback(
      from,
      to,
      controller.signal,
      attemptedActions
    );
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      return {
        ok: false,
        error: "Timeout consultando Analytics.",
        attemptedActions,
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message, attemptedActions };
  }
}
