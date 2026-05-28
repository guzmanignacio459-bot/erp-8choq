/**
 * Servicio ERP REMITO_ITEMS — read-only vía getRemitoItemsFull (GAS).
 */

import {
  mapGasRemitoItemsPayload,
} from "@/lib/erp/remito-items-mapper";
import type { ErpRemitoItemsPayload, ErpRemitoItemsSummary } from "@/types/erp";

const GAS_URL = (process.env.APPS_SCRIPT_URL ?? "").trim();
const GAS_TOKEN = (process.env.APPS_SCRIPT_TOKEN ?? "").trim();
const FETCH_TIMEOUT_MS = 45_000;

const GAS_ACTION = "getRemitoItemsFull";

type GasPayload = {
  ok?: boolean;
  data?: {
    items?: unknown[];
    summary?: Partial<ErpRemitoItemsSummary>;
    _log?: Record<string, unknown>;
  };
  error?: string;
};

export type FetchErpRemitoItemsResult =
  | {
      ok: true;
      data: ErpRemitoItemsPayload;
      gasActionUsed: string;
      attemptedActions: string[];
    }
  | {
      ok: false;
      error: string;
      attemptedActions: string[];
    };

function emptySummary(): ErpRemitoItemsSummary {
  return {
    totalPrendas: 0,
    netoTotalPrendas: 0,
    descuentoTotal: 0,
    shippingTotal: 0,
    feeTotal: 0,
    mpFeeAsignadoRealTotal: 0,
    unidadesScnl: 0,
    unidades8q: 0,
    rowsInScope: 0,
  };
}

function mapGasSummary(raw: unknown): ErpRemitoItemsSummary {
  if (!raw || typeof raw !== "object") return emptySummary();
  const s = raw as Record<string, unknown>;
  const num = (k: string) => {
    const v = Number(s[k]);
    return Number.isFinite(v) ? v : 0;
  };
  return {
    totalPrendas: num("totalPrendas"),
    netoTotalPrendas: num("netoTotalPrendas"),
    descuentoTotal: num("descuentoTotal"),
    shippingTotal: num("shippingTotal"),
    feeTotal: num("feeTotal"),
    mpFeeAsignadoRealTotal: num("mpFeeAsignadoRealTotal"),
    unidadesScnl: num("unidadesScnl"),
    unidades8q: num("unidades8q"),
    rowsInScope: num("rowsInScope"),
  };
}

function isUnknownGasActionError(message: string): boolean {
  const e = message.toLowerCase();
  return (
    e.includes("acción no soportada") ||
    e.includes("accion no soportada") ||
    e.includes("no soportada") ||
    e.includes("unknown action") ||
    e.includes("invalid action")
  );
}

async function callGasRemitoItemsFull(
  params: {
    from?: string;
    to?: string;
    sku?: string;
    owner?: string;
  },
  signal: AbortSignal
): Promise<{
  ok: boolean;
  payload: GasPayload;
  error?: string;
  httpStatus: number;
}> {
  const res = await fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    signal,
    body: JSON.stringify({
      action: GAS_ACTION,
      from: params.from || undefined,
      to: params.to || undefined,
      sku: params.sku || undefined,
      owner: params.owner || undefined,
      token: GAS_TOKEN,
    }),
  });

  const text = await res.text();
  let payload: GasPayload = {};
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

export async function fetchErpRemitoItems(options?: {
  from?: string;
  to?: string;
  sku?: string;
  owner?: string;
  signal?: AbortSignal;
}): Promise<FetchErpRemitoItemsResult> {
  const attemptedActions: string[] = [];

  if (!GAS_URL) {
    return {
      ok: false,
      error: "APPS_SCRIPT_URL no configurada en el servidor.",
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
    attemptedActions.push(GAS_ACTION);
    const gasResult = await callGasRemitoItemsFull(
      {
        from: options?.from,
        to: options?.to,
        sku: options?.sku,
        owner: options?.owner,
      },
      controller.signal
    );

    clearTimeout(timeoutId);

    if (!gasResult.ok) {
      const msg = gasResult.error ?? "getRemitoItemsFull falló";
      return {
        ok: false,
        error: isUnknownGasActionError(msg)
          ? `${msg} (requiere redeploy GAS con getRemitoItemsFull)`
          : msg,
        attemptedActions,
      };
    }

    const items = mapGasRemitoItemsPayload(gasResult.payload);
    const summary = mapGasSummary(gasResult.payload.data?.summary);

    const log = gasResult.payload.data?._log;
    if (log && typeof log === "object") {
      console.log("[erp/remito-items] GAS", log);
    }

    return {
      ok: true,
      data: { items, summary },
      gasActionUsed: GAS_ACTION,
      attemptedActions,
    };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      return {
        ok: false,
        error: "Timeout consultando REMITO_ITEMS.",
        attemptedActions,
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message, attemptedActions };
  }
}
