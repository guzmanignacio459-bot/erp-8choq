/**
 * ERP — delegación server-side a POST /api/tiendanube/orders-paid/import-orders.
 * No expone tokens al cliente. Franjas horarias orquestadas aquí.
 */

import {
  buildHourlySlots,
  isSingleCalendarDay,
  resolveImportRequest,
  type ResolvedImportRequest,
} from "@/lib/erp/import-orders-date";
import type {
  ErpOrdersImportErrorRow,
  ErpOrdersImportMetrics,
  ErpOrdersImportRequestBody,
  ErpOrdersImportResult,
  ErpOrdersImportSlotResult,
} from "@/types/erp";

const IMPORT_ORDERS_TIMEOUT_MS = 300_000;

type ImportOrdersUpstreamPayload = {
  fromISO: string;
  toISO: string;
  dryRun?: boolean;
  fetchDetails?: boolean;
  perPage?: number;
  throttleMs?: number;
  maxPages?: number;
  singleOrderId?: string;
  importMp?: boolean;
  mpForce?: boolean;
};

function resolveInternalOrigin(req: Request): string {
  const proto = (req.headers.get("x-forwarded-proto") ?? "https")
    .split(",")[0]
    .trim();
  const host = (
    req.headers.get("x-forwarded-host") ??
    req.headers.get("host") ??
    ""
  )
    .split(",")[0]
    .trim();

  if (!host) {
    throw new Error(
      "No se pudo resolver el host interno para import-orders."
    );
  }

  return `${proto}://${host}`;
}

function resolveImportToken(): string {
  const candidates = [
    process.env.TIENDANUBE_IMPORT_TOKEN,
    process.env.IMPORT_ORDERS_TOKEN,
    process.env.IMPORT_TOKEN,
  ];

  for (const raw of candidates) {
    const val = (raw ?? "").trim();
    if (val) return val;
  }

  throw new Error(
    "Falta token de importación en ENV (IMPORT_ORDERS_TOKEN o IMPORT_TOKEN)."
  );
}

function buildImportOrdersHeaders(): Record<string, string> {
  const importToken = resolveImportToken();
  const mpImportToken = (process.env.MP_IMPORT_TOKEN ?? "").trim();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-import-orders-token": importToken,
    "x-import-token": importToken,
  };

  if (mpImportToken) {
    headers["x-mp-import-token"] = mpImportToken;
  }

  return headers;
}

function emptyMetrics(): ErpOrdersImportMetrics {
  return {
    imported: 0,
    duplicated: 0,
    skipped: 0,
    consideredPaid: 0,
    consideredInRange: 0,
    wouldImport: 0,
    errorsCount: 0,
  };
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function normalizeErrors(raw: unknown): ErpOrdersImportErrorRow[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      const r = asRecord(row);
      return {
        orderId: r.orderId != null ? String(r.orderId) : undefined,
        step: String(r.step ?? "unknown"),
        message: String(r.message ?? ""),
      };
    })
    .filter((e) => e.message || e.step);
}

function deriveSkipped(
  consideredInRange: number,
  wouldImport: number,
  singleSkipped: boolean
): number {
  if (singleSkipped) return 1;
  return Math.max(0, consideredInRange - wouldImport);
}

function normalizeImportOrdersPayload(
  payload: Record<string, unknown>,
  elapsedMs: number
): Pick<
  ErpOrdersImportResult,
  "ok" | "mode" | "metrics" | "errors" | "raw" | "error" | "message"
> {
  const ok = payload.ok !== false;
  const modeRaw = String(payload.mode ?? "batch");
  const mode =
    modeRaw === "single_order"
      ? "single_order"
      : modeRaw === "hourly_slots"
        ? "hourly_slots"
        : "batch";

  const metricsRaw = asRecord(payload.metrics);
  const consideredPaid = Number(metricsRaw.consideredPaid ?? 0) || 0;
  const consideredInRange = Number(metricsRaw.consideredInRange ?? 0) || 0;
  const wouldImport = Number(metricsRaw.wouldImport ?? 0) || 0;
  const imported = Number(metricsRaw.imported ?? 0) || 0;
  const duplicated = Number(metricsRaw.duplicated ?? 0) || 0;
  const errors = normalizeErrors(payload.errors);
  const errorsCount =
    Number(metricsRaw.errors ?? errors.length) || errors.length;

  const singleSkipped = payload.skipped === true;

  const metrics: ErpOrdersImportMetrics = {
    imported,
    duplicated,
    skipped: deriveSkipped(
      consideredInRange,
      wouldImport,
      singleSkipped
    ),
    consideredPaid,
    consideredInRange,
    wouldImport,
    errorsCount,
  };

  if (!ok) {
    return {
      ok: false,
      mode,
      metrics,
      errors,
      raw: payload,
      error: String(
        payload.error ?? payload.message ?? payload.step ?? "import-orders falló"
      ),
    };
  }

  void elapsedMs;

  return {
    ok: true,
    mode,
    metrics,
    errors,
    raw: payload,
    message:
      typeof payload.message === "string" ? payload.message : undefined,
  };
}

function addMetrics(
  target: ErpOrdersImportMetrics,
  source: ErpOrdersImportMetrics
): void {
  target.imported += source.imported;
  target.duplicated += source.duplicated;
  target.skipped += source.skipped;
  target.consideredPaid += source.consideredPaid;
  target.consideredInRange += source.consideredInRange;
  target.wouldImport += source.wouldImport;
  target.errorsCount += source.errorsCount;
}

function buildUpstreamPayload(
  resolved: ResolvedImportRequest,
  range: { fromISO: string; toISO: string }
): ImportOrdersUpstreamPayload {
  const payload: ImportOrdersUpstreamPayload = {
    fromISO: range.fromISO,
    toISO: range.toISO,
    dryRun: resolved.dryRun,
    fetchDetails: resolved.fetchDetails,
    perPage: resolved.perPage,
    maxPages: resolved.maxPages,
    throttleMs: resolved.throttleMs,
    importMp: resolved.importMp,
    mpForce: resolved.mpForce,
  };

  if (resolved.singleOrderId) {
    payload.singleOrderId = resolved.singleOrderId;
  }

  return payload;
}

async function callImportOrders(
  req: Request,
  payload: ImportOrdersUpstreamPayload
): Promise<{
  ok: boolean;
  httpStatus: number;
  payload: Record<string, unknown>;
  elapsedMs: number;
  error?: string;
}> {
  const headers = buildImportOrdersHeaders();
  const origin = resolveInternalOrigin(req);
  const url = `${origin}/api/tiendanube/orders-paid/import-orders`;

  const started = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    IMPORT_ORDERS_TIMEOUT_MS
  );

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const elapsedMs = Date.now() - started;
    const text = await res.text();

    let json: Record<string, unknown> = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      return {
        ok: false,
        httpStatus: res.status,
        payload: {},
        elapsedMs,
        error: `import-orders respondió no-JSON (HTTP ${res.status})`,
      };
    }

    const ok = res.ok && json.ok !== false;

    return {
      ok,
      httpStatus: res.status,
      payload: json,
      elapsedMs,
      error: ok
        ? undefined
        : String(json.error ?? json.message ?? `HTTP ${res.status}`),
    };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const elapsedMs = Date.now() - started;
    if (err instanceof Error && err.name === "AbortError") {
      return {
        ok: false,
        httpStatus: 504,
        payload: {},
        elapsedMs,
        error: "Timeout importando órdenes (import-orders).",
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      httpStatus: 502,
      payload: {},
      elapsedMs,
      error: message,
    };
  }
}

function buildInput(resolved: ResolvedImportRequest): ErpOrdersImportResult["input"] {
  return {
    fromISO: resolved.fromISO,
    toISO: resolved.toISO,
    dryRun: resolved.dryRun,
    importMp: resolved.importMp,
    mpForce: resolved.mpForce,
    singleOrderId: resolved.singleOrderId,
    fetchDetails: resolved.fetchDetails,
    perPage: resolved.perPage,
    maxPages: resolved.maxPages,
    throttleMs: resolved.throttleMs,
  };
}

export async function importOrdersViaErpWrapper(options: {
  req: Request;
  body: ErpOrdersImportRequestBody;
}): Promise<ErpOrdersImportResult> {
  const totalStarted = Date.now();

  let resolved: ResolvedImportRequest;
  try {
    resolved = resolveImportRequest(options.body);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      elapsedMs: Date.now() - totalStarted,
      mode: "batch",
      input: {
        fromISO: "",
        toISO: "",
        dryRun: true,
        importMp: false,
        mpForce: false,
      },
      metrics: emptyMetrics(),
      errors: [],
      raw: null,
      error: message,
    };
  }

  const input = buildInput(resolved);

  if (
    resolved.useHourlySlots &&
    !resolved.singleOrderId &&
    isSingleCalendarDay(resolved.fromISO, resolved.toISO)
  ) {
    const day = new Date(resolved.fromISO);
    const slots = buildHourlySlots(day, resolved.slotHours);
    const slotResults: ErpOrdersImportSlotResult[] = [];
    const combinedMetrics = emptyMetrics();
    const combinedErrors: ErpOrdersImportErrorRow[] = [];
    const rawSlots: unknown[] = [];
    let allOk = true;

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const payload = buildUpstreamPayload(resolved, slot);
      const call = await callImportOrders(options.req, payload);
      const normalized = normalizeImportOrdersPayload(
        call.payload,
        call.elapsedMs
      );

      if (!call.ok) allOk = false;

      addMetrics(combinedMetrics, normalized.metrics);
      combinedErrors.push(...normalized.errors);
      rawSlots.push(call.payload);

      slotResults.push({
        label: slot.label,
        fromISO: slot.fromISO,
        toISO: slot.toISO,
        ok: call.ok,
        elapsedMs: call.elapsedMs,
        metrics: normalized.metrics,
        errors: normalized.errors,
        error: call.error,
      });

      if (i < slots.length - 1 && resolved.throttleMs > 0) {
        await new Promise((r) => setTimeout(r, resolved.throttleMs));
      }
    }

    return {
      ok: allOk,
      elapsedMs: Date.now() - totalStarted,
      mode: "hourly_slots",
      input,
      metrics: combinedMetrics,
      errors: combinedErrors,
      slots: slotResults,
      raw: rawSlots,
      error: allOk ? undefined : "Una o más franjas fallaron.",
    };
  }

  const payload = buildUpstreamPayload(resolved, {
    fromISO: resolved.fromISO,
    toISO: resolved.toISO,
  });

  const call = await callImportOrders(options.req, payload);
  const normalized = normalizeImportOrdersPayload(call.payload, call.elapsedMs);

  return {
    ok: call.ok,
    elapsedMs: Date.now() - totalStarted,
    mode: normalized.mode,
    input,
    metrics: normalized.metrics,
    errors: normalized.errors,
    raw: call.payload,
    error: call.error ?? normalized.error,
    httpStatus: call.httpStatus,
    message: normalized.message,
  };
}
