/**
 * Servicio ERP — detalle de remito read-only vía GAS getRemito → getRemitoById().
 */

import { mapGetRemitoToErpDetail } from "@/lib/erp/remito-detail-mapper";
import type { ErpRemitoDetail } from "@/types/erp";

const GAS_URL = (process.env.APPS_SCRIPT_URL ?? "").trim();
const GAS_TOKEN = (process.env.APPS_SCRIPT_TOKEN ?? "").trim();
const FETCH_TIMEOUT_MS = 12_000;

const GAS_ACTION_PRIMARY = "getRemito";
const GAS_METHOD_FALLBACK = "getRemito";

type GasDetailPayload = {
  ok?: boolean;
  data?: unknown;
  error?: string;
};

type GasDetailCallResult = {
  actionUsed: string;
  ok: boolean;
  payload: GasDetailPayload;
  error?: string;
  httpStatus: number;
};

export type FetchErpRemitoDetailResult =
  | {
      ok: true;
      data: ErpRemitoDetail;
      gasActionUsed: string;
      attemptedActions: string[];
    }
  | {
      ok: false;
      error: string;
      attemptedActions: string[];
      notFound?: boolean;
    };

async function callGasGetRemito(
  body: Record<string, unknown>,
  actionUsed: string,
  signal: AbortSignal
): Promise<GasDetailCallResult> {
  const res = await fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    signal,
    body: JSON.stringify({
      ...body,
      token: GAS_TOKEN,
    }),
  });

  const text = await res.text();
  let payload: GasDetailPayload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    return {
      actionUsed,
      ok: false,
      payload: {},
      error: `Respuesta no JSON: ${text.slice(0, 200)}`,
      httpStatus: res.status,
    };
  }

  const gasOk = res.ok && payload.ok !== false && payload.data != null;

  return {
    actionUsed,
    ok: gasOk,
    payload,
    error: gasOk
      ? undefined
      : String(payload.error ?? `HTTP ${res.status}`),
    httpStatus: res.status,
  };
}

function isNotFoundError(message: string): boolean {
  const e = message.toLowerCase();
  return (
    e.includes("no existe") ||
    e.includes("not found") ||
    e.includes("no encontrado")
  );
}

/**
 * Obtiene detalle de remito por ID Remito — read-only.
 * Cascada: action getRemito → method getRemito (mismo handler GAS).
 */
export async function fetchErpRemitoDetail(
  id: string,
  options?: { signal?: AbortSignal }
): Promise<FetchErpRemitoDetailResult> {
  const idRemito = id.trim();
  const attemptedActions: string[] = [];

  if (!idRemito) {
    return { ok: false, error: "ID Remito requerido.", attemptedActions };
  }

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
    attemptedActions.push(GAS_ACTION_PRIMARY);
    let result = await callGasGetRemito(
      { action: GAS_ACTION_PRIMARY, id: idRemito },
      GAS_ACTION_PRIMARY,
      controller.signal
    );

    if (!result.ok) {
      attemptedActions.push(GAS_METHOD_FALLBACK);
      result = await callGasGetRemito(
        { method: GAS_METHOD_FALLBACK, id: idRemito },
        GAS_METHOD_FALLBACK,
        controller.signal
      );
    }

    clearTimeout(timeoutId);

    if (!result.ok) {
      const errorMsg = result.error ?? "No se pudo obtener el remito.";
      return {
        ok: false,
        error: errorMsg,
        attemptedActions,
        notFound: isNotFoundError(errorMsg),
      };
    }

    const rawData = result.payload.data;
    if (rawData && typeof rawData === "object") {
      const raw = rawData as Record<string, unknown>;
      console.log("[erp/remitos/detail] GAS MP raw", {
        idRemito,
        mpPaymentId: raw.mpPaymentId ?? raw.MP_PAYMENT_ID ?? null,
        mpStatus: raw.mpStatus ?? raw.MP_STATUS ?? null,
        mpNetoRealOrden: raw.mpNetoRealOrden ?? raw.MP_NETO_REAL_ORDEN ?? null,
      });
    }

    const mapped = mapGetRemitoToErpDetail(rawData);
    if (!mapped) {
      return {
        ok: false,
        error: "Respuesta de remito inválida o vacía.",
        attemptedActions,
      };
    }

    return {
      ok: true,
      data: mapped,
      gasActionUsed: result.actionUsed,
      attemptedActions,
    };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      return {
        ok: false,
        error: "Timeout consultando Apps Script.",
        attemptedActions,
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message, attemptedActions };
  }
}
