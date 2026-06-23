/**
 * ERP — delegación server-side a POST /api/mercadopago/import-payment.
 * No expone tokens al cliente.
 */

import type { ErpMpApplyResult } from "@/types/erp";

const MP_APPLY_TIMEOUT_MS = 120_000;

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
    throw new Error("No se pudo resolver el host interno para import-payment.");
  }

  return `${proto}://${host}`;
}

function buildImportPaymentHeaders(): Record<string, string> {
  // Mismos criterios que import-payment / import-orders (solo servidor)
  const importToken = (
    process.env.IMPORT_TOKEN ??
    "59c2e66c17555371234f0116b6c52351bc6bcc6c077e6033b3a5d24d6688d364"
  ).trim();

  const mpImportToken = (
    process.env.MP_IMPORT_TOKEN ?? "8q_mp_manual_token_2026_secure_91a8d7f3"
  ).trim();

  return {
    "Content-Type": "application/json",
    "x-import-token": importToken,
    "x-mp-import-token": mpImportToken,
  };
}

export async function applyMercadoPagoViaImportPayment(options: {
  req: Request;
  tnOrderId: string;
  force?: boolean;
  idRemito?: string;
}): Promise<ErpMpApplyResult> {
  const tnOrderId = options.tnOrderId.trim();
  if (!tnOrderId) {
    return { ok: false, error: "tnOrderId requerido" };
  }
  const idRemito = options.idRemito?.trim() || undefined;

  const headers = buildImportPaymentHeaders();

  let origin: string;
  try {
    origin = resolveInternalOrigin(options.req);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: message };
  }

  const url = `${origin}/api/mercadopago/import-payment`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), MP_APPLY_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        tnOrderId,
        force: options.force === true,
        ...(idRemito ? { idRemito } : {}),
      }),
      cache: "no-store",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const text = await res.text();
    let payload: Record<string, unknown> = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      return {
        ok: false,
        error: `import-payment respondió no-JSON (HTTP ${res.status})`,
        httpStatus: res.status,
        rawBody: text.slice(0, 300),
      };
    }

    const ok = res.ok && payload.ok !== false;

    if (!ok) {
      return {
        ok: false,
        error: String(
          payload.message ?? payload.error ?? `import-payment HTTP ${res.status}`
        ),
        httpStatus: res.status,
        correlationId:
          typeof payload.correlationId === "string"
            ? payload.correlationId
            : undefined,
        details: payload,
      };
    }

    const skipped = payload.skipped === true;

    return {
      ok: true,
      skipped,
      reason:
        typeof payload.reason === "string" ? payload.reason : undefined,
      tnOrderId:
        payload.tnOrderId != null ? String(payload.tnOrderId) : tnOrderId,
      mpPaymentId:
        typeof payload.mpPaymentId === "string"
          ? payload.mpPaymentId
          : payload.paymentId != null
            ? String(payload.paymentId)
            : undefined,
      correlationId:
        typeof payload.correlationId === "string"
          ? payload.correlationId
          : undefined,
      message: skipped
        ? "Mercado Pago ya estaba aplicado en la hoja."
        : "Mercado Pago aplicado correctamente.",
      details: payload,
    };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      return {
        ok: false,
        error: "Timeout aplicando Mercado Pago (import-payment).",
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
