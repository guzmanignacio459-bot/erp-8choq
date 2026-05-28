import { fieldSlug } from "@/lib/erp/remitos-mapper";
import type { ErpRemito, ErpRemitosDataShape } from "@/types/erp";

const REDACT_KEY_PATTERN =
  /token|secret|password|authorization|api[_-]?key|credential|private[_-]?key/i;

const MAX_STRING = 800;
const MAX_ARRAY_ITEMS = 5;
const MAX_DEPTH = 5;

/** Elimina tokens/URLs sensibles y limita tamaño para debug temporal */
export function sanitizeForDebug(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return "[MaxDepth]";
  if (value === null || value === undefined) return value;

  if (typeof value === "string") {
    if (/^https?:\/\//i.test(value) && value.includes("script.google")) {
      return "[REDACTED_URL]";
    }
    if (value.length > MAX_STRING) {
      return `${value.slice(0, MAX_STRING)}…`;
    }
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => sanitizeForDebug(item, depth + 1));
  }

  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (REDACT_KEY_PATTERN.test(key)) {
        out[key] = "[REDACTED]";
      } else {
        out[key] = sanitizeForDebug(val, depth + 1);
      }
    }
    return out;
  }

  return String(value);
}

export type ErpRemitosGasAttemptError = {
  action: string;
  httpStatus: number;
  message: string;
  rawResponse: unknown;
};

export type ErpRemitosDebugSnapshot = {
  rowCount: number;
  listActionUsed: string;
  attemptedActions: string[];
  fallbackFrom?: string;
  /** Error exacto del intento previo cuando hubo fallback (p. ej. listRemitosFull) */
  fallbackAttemptError?: ErpRemitosGasAttemptError;
  dataShape: ErpRemitosDataShape;
  payloadTopLevelKeys: string[];
  rawFirstRowKeys: string[];
  rawFirstRow: unknown;
  mappedFirstRow: ErpRemito | null;
};

/** Heurística: fila con columnas de sheet vs listRemitos resumido */
export function detectRemitosDataShape(
  firstRow: unknown
): ErpRemitosDataShape {
  if (!firstRow || typeof firstRow !== "object" || Array.isArray(firstRow)) {
    return "unknown";
  }

  const slugs = Object.keys(firstRow as Record<string, unknown>).map(fieldSlug);

  const fullSlugs = new Set([
    "idremito",
    "provincialocalidad",
    "transporte",
    "detallegeneral",
    "tnorderid",
    "mppaymentid",
    "mpstatus",
    "shippingcustomercost",
    "shippingownercost",
    "recargodescuento",
  ]);

  if (slugs.some((s) => fullSlugs.has(s))) {
    return "full";
  }

  const summarySlugs = new Set([
    "id",
    "fecha",
    "nombre",
    "metodopago",
    "vendedor",
    "totalprendas",
    "totalfinal",
    "estado",
  ]);

  if (
    slugs.length > 0 &&
    slugs.length <= 9 &&
    slugs.every((s) => summarySlugs.has(s))
  ) {
    return "summary";
  }

  return slugs.length > 9 ? "full" : "unknown";
}

export function buildGasAttemptErrorDebug(
  result: {
    action: string;
    httpStatus: number;
    error?: string;
    payload: Record<string, unknown>;
    rawResponseText?: string;
  }
): ErpRemitosGasAttemptError {
  let rawResponse: unknown = sanitizeForDebug(result.payload);

  if (result.rawResponseText?.trim()) {
    try {
      rawResponse = sanitizeForDebug(JSON.parse(result.rawResponseText));
    } catch {
      rawResponse = sanitizeForDebug(result.rawResponseText);
    }
  }

  return {
    action: result.action,
    httpStatus: result.httpStatus,
    message: result.error ?? `HTTP ${result.httpStatus}`,
    rawResponse,
  };
}

export function buildRemitosDebugSnapshot(
  payload: Record<string, unknown>,
  rawRows: unknown[],
  mappedRows: ErpRemito[],
  meta: {
    listActionUsed: string;
    attemptedActions: string[];
    fallbackFrom?: string;
    fallbackAttemptError?: ErpRemitosGasAttemptError;
  }
): ErpRemitosDebugSnapshot {
  const firstRaw = rawRows[0];
  const rawKeys =
    firstRaw && typeof firstRaw === "object" && !Array.isArray(firstRaw)
      ? Object.keys(firstRaw as Record<string, unknown>)
      : [];

  return {
    rowCount: rawRows.length,
    listActionUsed: meta.listActionUsed,
    attemptedActions: meta.attemptedActions,
    fallbackFrom: meta.fallbackFrom,
    fallbackAttemptError: meta.fallbackAttemptError,
    dataShape: detectRemitosDataShape(firstRaw),
    payloadTopLevelKeys: Object.keys(payload),
    rawFirstRowKeys: rawKeys,
    rawFirstRow: sanitizeForDebug(firstRaw),
    mappedFirstRow: mappedRows[0] ?? null,
  };
}

export function logRemitosDebug(snapshot: ErpRemitosDebugSnapshot): void {
  console.log("[erp/remitos debug] listActionUsed:", snapshot.listActionUsed);
  console.log("[erp/remitos debug] attemptedActions:", snapshot.attemptedActions);
  if (snapshot.fallbackFrom) {
    console.log("[erp/remitos debug] fallbackFrom:", snapshot.fallbackFrom);
  }
  if (snapshot.fallbackAttemptError) {
    console.log(
      "[erp/remitos debug] fallbackAttemptError:",
      JSON.stringify(snapshot.fallbackAttemptError, null, 2)
    );
  }
  console.log("[erp/remitos debug] dataShape:", snapshot.dataShape);
  console.log("[erp/remitos debug] rowCount:", snapshot.rowCount);
  console.log(
    "[erp/remitos debug] payloadTopLevelKeys:",
    snapshot.payloadTopLevelKeys
  );
  console.log("[erp/remitos debug] rawFirstRowKeys:", snapshot.rawFirstRowKeys);
  console.log(
    "[erp/remitos debug] rawFirstRow:",
    JSON.stringify(snapshot.rawFirstRow, null, 2)
  );
  console.log(
    "[erp/remitos debug] mappedFirstRow:",
    JSON.stringify(snapshot.mappedFirstRow, null, 2)
  );
}
