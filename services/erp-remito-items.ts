/**
 * Servicio ERP REMITO_ITEMS — read-only vía getRemitoItemsFull (GAS).
 */

import {
  mapGasRemitoItemsPayload,
} from "@/lib/erp/remito-items-mapper";
import type { ErpRemitoItemsPayload, ErpRemitoItemsSummary } from "@/types/erp";

const GAS_URL = (process.env.APPS_SCRIPT_URL ?? "").trim();
const GAS_TOKEN = (process.env.APPS_SCRIPT_TOKEN ?? "").trim();
/** GAS escanea REMITO_ITEMS completo si prod no filtra por fecha — margen bajo maxDuration 60s */
const FETCH_TIMEOUT_MS = 58_000;

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
      elapsedMs: number;
      gasRowsInScope?: number;
    }
  | {
      ok: false;
      error: string;
      attemptedActions: string[];
      elapsedMs?: number;
      gasHttpStatus?: number;
    };

function emptySummary(): ErpRemitoItemsSummary {
  return {
    totalBrutoPrendas: 0,
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
    totalBrutoPrendas: num("totalBrutoPrendas"),
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
  elapsedMs: number;
}> {
  const started = Date.now();
  const res = await fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    signal,
    body: JSON.stringify({
      action: GAS_ACTION,
      method: GAS_ACTION,
      from: params.from || undefined,
      to: params.to || undefined,
      sku: params.sku || undefined,
      owner: params.owner || undefined,
      token: GAS_TOKEN,
    }),
  });

  const elapsedMs = Date.now() - started;
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
      elapsedMs,
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
    elapsedMs,
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
    const requestStarted = Date.now();
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
    const totalElapsedMs = Date.now() - requestStarted;

    if (!gasResult.ok) {
      const msg = gasResult.error ?? "getRemitoItemsFull falló";
      console.warn("[erp/remito-items] GAS fail", {
        action: GAS_ACTION,
        from: options?.from ?? null,
        to: options?.to ?? null,
        sku: options?.sku ? "(set)" : null,
        owner: options?.owner ?? null,
        gasHttpStatus: gasResult.httpStatus,
        gasElapsedMs: gasResult.elapsedMs,
        totalElapsedMs,
        error: msg.slice(0, 200),
      });
      return {
        ok: false,
        error: isUnknownGasActionError(msg)
          ? `${msg} (requiere redeploy GAS con getRemitoItemsFull)`
          : msg,
        attemptedActions,
        elapsedMs: totalElapsedMs,
        gasHttpStatus: gasResult.httpStatus,
      };
    }

    const items = mapGasRemitoItemsPayload(gasResult.payload);
    const summary = mapGasSummary(gasResult.payload.data?.summary);

    const log = gasResult.payload.data?._log;
    const rowsInScope =
      typeof summary.rowsInScope === "number" ? summary.rowsInScope : undefined;

    console.log("[erp/remito-items] GAS ok", {
      action: GAS_ACTION,
      from: options?.from ?? null,
      to: options?.to ?? null,
      gasElapsedMs: gasResult.elapsedMs,
      totalElapsedMs,
      itemsMapped: items.length,
      rowsInScope: rowsInScope ?? null,
      gasLog: log ?? null,
    });

    return {
      ok: true,
      data: { items, summary },
      gasActionUsed: GAS_ACTION,
      attemptedActions,
      elapsedMs: totalElapsedMs,
      gasRowsInScope: rowsInScope,
    };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      console.warn("[erp/remito-items] timeout", {
        action: GAS_ACTION,
        from: options?.from ?? null,
        to: options?.to ?? null,
        timeoutMs: FETCH_TIMEOUT_MS,
      });
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
