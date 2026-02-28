// app/api/mercadopago/import-payment/route.ts
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";

/**
 * MP Import Payment — Hardened / Idempotent
 * - Mantiene payload actual hacia GAS (mode, tnOrderId, mp, force, _meta)
 * - Agrega lookup opcional en GAS (action=get_remito_by_tn_order_id) para skip si ya existe MP_PAYMENT_ID y !force
 * - Soporta dos modos:
 *    A) { tnOrderId, force }  -> busca payment en MP por external_reference == tnOrderId (recomendado)
 *    B) { paymentId, tnOrderId?, force } -> usa paymentId directo (legacy/manual)
 * - Manejo de errores consistente + correlation id
 */

const BUILD_MARK = "MP_IMPORT_PAYMENT__2026_02_24__OPT_A1";

// Tokens
const MP_IMPORT_TOKEN =
  process.env.MP_IMPORT_TOKEN ?? "8q_mp_manual_token_2026_secure_91a8d7f3";

const IMPORT_TOKEN = (process.env.IMPORT_TOKEN ?? "").trim(); // mismo criterio que import-orders
const MP_ACCESS_TOKEN = (process.env.MP_ACCESS_TOKEN ?? "").trim();

// GAS
const GAS_WEBAPP_URL = (process.env.GAS_WEBAPP_URL ?? "").trim(); // tu WebApp URL
const APPS_SCRIPT_TOKEN = (process.env.APPS_SCRIPT_TOKEN ?? "").trim(); // token interno GAS (header x-apps-script-token)

function assertEnv() {
  if (!MP_ACCESS_TOKEN) throw new Error("MP_ACCESS_TOKEN missing");
  if (!GAS_WEBAPP_URL) throw new Error("GAS_WEBAPP_URL missing");
  // APPS_SCRIPT_TOKEN: si no lo configuraste aún, igual funciona postToGas(),
  // pero NO vamos a poder hacer lookup idempotente. Preferible tenerlo.
}

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

function getHeader(req: Request, key: string) {
  return (req.headers.get(key) ?? "").trim();
}

function assertMpImportToken(req: Request) {
  const incoming = getHeader(req, "x-mp-import-token");
  if (!incoming || incoming !== MP_IMPORT_TOKEN) throw new Error("MP_IMPORT_TOKEN invalid");
}

function assertImportToken(req: Request) {
  const incoming = getHeader(req, "x-import-token");
  const expected = IMPORT_TOKEN || "59c2e66c17555371234f0116b6c52351bc6bcc6c077e6033b3a5d24d6688d364";
  if (!incoming || incoming !== expected) {
    const err: any = new Error("unauthorized");
    err.status = 401;
    throw err;
  }
}

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    // @ts-ignore: allow passing signal to fetch promises outside
    return await p;
  } catch (e: any) {
    if (e?.name === "AbortError") throw new Error(`${label}_timeout_${ms}ms`);
    throw e;
  } finally {
    clearTimeout(t);
  }
}

async function withRetry<T>(
  fn: () => Promise<T>,
  opts?: { retries?: number; baseMs?: number; tag?: string }
): Promise<T> {
  const retries = opts?.retries ?? 2;
  const baseMs = opts?.baseMs ?? 500;
  const tag = opts?.tag ?? "retry";

  let lastErr: any;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      if (i === retries) break;
      const wait = baseMs * Math.pow(2, i);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  const e = new Error(`${tag}_failed: ${String(lastErr?.message ?? lastErr)}`);
  // @ts-ignore
  e.cause = lastErr;
  throw e;
}

// ===== MP fetch =====
async function fetchMpPaymentById(paymentId: number) {
  const url = `https://api.mercadopago.com/v1/payments/${paymentId}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  const text = await res.text();
  const data = safeJsonParse(text) ?? { raw: text };
  if (!res.ok) return { ok: false as const, status: res.status, data };
  return { ok: true as const, status: res.status, data };
}

/**
 * Busca pago por external_reference == tnOrderId.
 * Preferimos el pago aprobado (date_approved más reciente) o el más nuevo.
 * Nota: MP search endpoint soporta "external_reference".
 */
async function searchMpPaymentIdByExternalReference(tnOrderId: string) {
  const qs = new URLSearchParams({
    external_reference: tnOrderId,
    sort: "date_created",
    criteria: "desc",
    limit: "20",
    offset: "0",
  });

  const url = `https://api.mercadopago.com/v1/payments/search?${qs.toString()}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  const text = await res.text();
  const data = safeJsonParse(text) ?? { raw: text };

  if (!res.ok) return { ok: false as const, status: res.status, data };

  const results: any[] = Array.isArray(data?.results) ? data.results : [];
  if (!results.length) return { ok: true as const, status: res.status, paymentId: null as number | null, pickedRule: "no_results" };

  // Pick: prefer approved, then most recent by date_approved/date_created
  const score = (p: any) => {
    const st = String(p?.status ?? "");
    const approved = st === "approved" ? 1000 : 0;
    const da = Date.parse(p?.date_approved ?? "") || 0;
    const dc = Date.parse(p?.date_created ?? "") || 0;
    return approved + Math.max(da, dc);
  };

  const best = results.slice().sort((a, b) => score(b) - score(a))[0];
  const pid = Number(best?.id);

  if (!pid || Number.isNaN(pid)) {
    return { ok: true as const, status: res.status, paymentId: null as number | null, pickedRule: "id_not_numeric" };
  }

  return {
    ok: true as const,
    status: res.status,
    paymentId: pid,
    pickedRule: "picked_best_from_search",
  };
}

// ===== GAS calls =====
async function callGas<T>(url: string, token: string, body: any): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "x-apps-script-token": token } : {}),
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const text = await res.text();
  const parsed = safeJsonParse(text);
  if (!res.ok) {
    throw new Error(`GAS_HTTP_${res.status}: ${parsed ? JSON.stringify(parsed) : text}`);
  }
  return (parsed ?? { raw: text }) as T;
}

async function gasGetRemitoByTnOrderId(tnOrderId: string) {
  if (!APPS_SCRIPT_TOKEN) return { ok: false, found: false, _note: "APPS_SCRIPT_TOKEN missing, lookup skipped" } as any;
  return callGas<{ ok: boolean; found: boolean; remito?: any }>(GAS_WEBAPP_URL, APPS_SCRIPT_TOKEN, {
    action: "get_remito_by_tn_order_id",
    tnOrderId,
  });
}

async function postToGas(payload: any) {
  const res = await fetch(GAS_WEBAPP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const text = await res.text();
  const parsed = safeJsonParse(text);
  return { status: res.status, text, parsed };
}

// ===== tnOrderId inference (solo si usás modo paymentId sin tnOrderId) =====
function inferTnOrderIdFromMp(mp: any): { tnOrderId?: number; rule?: string; confidence?: number } {
  const extRef = String(mp?.external_reference ?? "").trim();
  if (/^\d+$/.test(extRef)) return { tnOrderId: Number(extRef), rule: "mp.external_reference_numeric", confidence: 0.9 };

  const items = mp?.additional_info?.items;
  if (Array.isArray(items)) {
    for (const it of items) {
      const maybe = String(it?.id ?? "").trim();
      if (/^\d+$/.test(maybe)) return { tnOrderId: Number(maybe), rule: "mp.additional_info.items.id_numeric", confidence: 0.7 };
    }
  }

  const addExt = String(mp?.additional_info?.external_reference ?? "").trim();
  if (/^\d+$/.test(addExt)) return { tnOrderId: Number(addExt), rule: "mp.additional_info.external_reference_numeric", confidence: 0.6 };

  return {};
}

// ===== normalize (idéntico a tu contrato) =====
function normalizeMpForGas(mpRaw: any, fallbackPaymentId: number) {
  const paymentId = String(mpRaw?.id ?? mpRaw?.paymentId ?? fallbackPaymentId ?? "").trim();

  const transactionAmount = Number(mpRaw?.transaction_amount ?? 0);
  const netReceivedAmount = Number(mpRaw?.transaction_details?.net_received_amount ?? 0);

  const taxTotal = Number(mpRaw?.taxes_amount ?? 0);

  const feeDetails = Array.isArray(mpRaw?.fee_details) ? mpRaw.fee_details : [];
  const sumByType = (type: string) =>
    feeDetails.filter((f: any) => String(f?.type ?? "") === type).reduce((acc: number, f: any) => acc + Number(f?.amount ?? 0), 0);

  const feeTotal = sumByType("mercadopago_fee");
  const financingTotal = sumByType("financing_fee");
  const platformFeeTotal = sumByType("application_fee");

  const feesSum = feeDetails.reduce((acc: number, f: any) => acc + Number(f?.amount ?? 0), 0);
  const totalCost = taxTotal + feesSum;

  const status = String(mpRaw?.status ?? "").trim();
  const statusDetail = String(mpRaw?.status_detail ?? "").trim();

  const payerEmail = String(mpRaw?.payer?.email ?? "").trim();
  const paymentType = String(mpRaw?.payment_type_id ?? "").trim();
  const paymentMethod = String(mpRaw?.payment_method_id ?? "").trim();
  const installments = Number(mpRaw?.installments ?? 0);

  const additionalReference = mpRaw?.external_reference ?? mpRaw?.additional_info?.external_reference ?? "";

  return {
    paymentId,
    additionalReference,

    status,
    statusDetail,

    dateCreated: mpRaw?.date_created ?? "",
    dateApproved: mpRaw?.date_approved ?? "",
    moneyReleaseDate: mpRaw?.money_release_date ?? "",

    transactionAmount,
    netReceivedAmount,
    taxTotal,
    financingTotal,
    feeTotal,
    platformFeeTotal,
    totalCost,

    // compat
    taxTotalReal: taxTotal,
    financingTotalReal: financingTotal,
    feeTotalReal: feeTotal,
    platformFeeTotalReal: platformFeeTotal,
    totalCostReal: totalCost,

    payerEmail,
    paymentType,
    paymentMethod,
    installments,

    raw: mpRaw,
  };
}

// ===== Handler =====
export async function POST(req: Request) {
  const correlationId =
    getHeader(req, "x-correlation-id") ||
    `mp_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  try {
    assertEnv();
    assertMpImportToken(req);
    assertImportToken(req);

    const body = await req.json().catch(() => ({} as any));

    // Soporta:
    // - recomendado: { tnOrderId, force }
    // - legacy: { paymentId, tnOrderId?, force }
    const force = Boolean(body?.force);

    const tnOrderIdProvided =
      body?.tnOrderId != null && String(body.tnOrderId).trim() !== ""
        ? String(body.tnOrderId).trim()
        : null;

    const paymentIdProvided =
      body?.paymentId != null && String(body.paymentId).trim() !== ""
        ? Number(body.paymentId)
        : null;

    if (!tnOrderIdProvided && (!paymentIdProvided || Number.isNaN(paymentIdProvided))) {
      return json(400, {
        ok: false,
        build: BUILD_MARK,
        error: "tnOrderId_or_paymentId_required",
        correlationId,
      });
    }

    // 0) Determinar tnOrderId (si vino) para idempotencia / meta
    let tnOrderId = tnOrderIdProvided ? tnOrderIdProvided : null;
    let matchRule = tnOrderIdProvided ? "provided" : "inferred_from_mp";
    let confidence = tnOrderIdProvided ? 1.0 : 0;

    // 1) Si tenemos tnOrderId: idempotencia contra Sheets (si APPS_SCRIPT_TOKEN existe)
    if (tnOrderId) {
      const lookup = await withRetry(() => gasGetRemitoByTnOrderId(tnOrderId!), {
        retries: 2,
        baseMs: 400,
        tag: "gas_lookup_remito",
      }).catch(() => null);

      if (lookup?.ok && lookup?.found) {
        const mpPaymentId = String(lookup?.remito?.MP_PAYMENT_ID ?? "").trim();
        if (mpPaymentId && !force) {
          return json(200, {
            ok: true,
            skipped: true,
            reason: "mp_already_applied_in_sheets",
            build: BUILD_MARK,
            correlationId,
            tnOrderId,
            mpPaymentId,
          });
        }
      }
    }

    // 2) Resolver paymentId:
    // - si vino paymentId => usarlo
    // - si NO vino paymentId pero vino tnOrderId => buscar por external_reference
    let paymentId: number | null = paymentIdProvided && !Number.isNaN(paymentIdProvided) ? paymentIdProvided : null;
    let paymentPickRule = paymentId ? "paymentId_provided" : "";

    if (!paymentId) {
      if (!tnOrderId) {
        return json(409, {
          ok: false,
          build: BUILD_MARK,
          error: "tnOrderId_required_when_paymentId_missing",
          correlationId,
        });
      }

      const search = await withRetry(() => searchMpPaymentIdByExternalReference(tnOrderId!), {
        retries: 2,
        baseMs: 600,
        tag: "mp_search_external_reference",
      });

      if (!search.ok) {
        return json(502, {
          ok: false,
          build: BUILD_MARK,
          error: "mp_search_failed",
          correlationId,
          mpStatus: search.status,
          mpError: search.data,
        });
      }

      paymentId = search.paymentId;
      paymentPickRule = search.pickedRule;

      if (!paymentId) {
        return json(404, {
          ok: false,
          build: BUILD_MARK,
          error: "payment_not_found_by_external_reference",
          correlationId,
          tnOrderId,
          paymentPickRule,
        });
      }
    }

    // 3) Traer MP payment por id
    const mpRes = await withRetry(() => fetchMpPaymentById(paymentId!), {
      retries: 2,
      baseMs: 700,
      tag: "mp_fetch_payment",
    });

    if (!mpRes.ok) {
      return json(502, {
        ok: false,
        build: BUILD_MARK,
        error: "mp_fetch_failed",
        correlationId,
        tnOrderId,
        paymentId,
        mpStatus: mpRes.status,
        mpError: mpRes.data,
      });
    }

    const mp = mpRes.data;

    // 4) Si tnOrderId no vino, inferirlo (modo legacy paymentId-only)
    if (!tnOrderId) {
      const inferred = inferTnOrderIdFromMp(mp);
      tnOrderId = inferred.tnOrderId != null ? String(inferred.tnOrderId) : null;
      matchRule = inferred.rule ?? "not_found";
      confidence = inferred.confidence ?? 0;

      if (!tnOrderId) {
        return json(409, {
          ok: false,
          build: BUILD_MARK,
          error: "tnOrderId_not_resolved",
          correlationId,
          paymentId,
          matchRule,
          confidence,
          hint: "Send tnOrderId explicitly to force apply.",
        });
      }
    }

    // 5) Segunda barrera idempotente (si al principio no pudimos lookup porque tnOrderId no estaba)
    if (tnOrderId) {
      const lookup2 = await withRetry(() => gasGetRemitoByTnOrderId(tnOrderId!), {
        retries: 2,
        baseMs: 400,
        tag: "gas_lookup_remito_2",
      }).catch(() => null);

      if (lookup2?.ok && lookup2?.found) {
        const mpPaymentId = String(lookup2?.remito?.MP_PAYMENT_ID ?? "").trim();
        if (mpPaymentId && !force) {
          return json(200, {
            ok: true,
            skipped: true,
            reason: "mp_already_applied_in_sheets",
            build: BUILD_MARK,
            correlationId,
            tnOrderId,
            mpPaymentId,
            note: "lookup_after_inference",
          });
        }
      }
    }

    // 6) Payload EXACTO que tu GAS ya soporta
    const mpForGas = normalizeMpForGas(mp, paymentId!);

    const payload = {
      mode: "mp_import_payment",
      tnOrderId: Number(tnOrderId), // mantenemos numérico como venías usando
      mp: mpForGas,
      force: force === true,
      _meta: {
        build: BUILD_MARK,
        correlationId,
        matchRule,
        matchConfidence: confidence,
        paymentPickRule,
        source: "nextjs_mp_import_payment",
      },
    };

    // 7) Post a GAS
    const gasRes = await withRetry(() => postToGas(payload), {
      retries: 2,
      baseMs: 600,
      tag: "gas_apply_mp",
    });

    return json(200, {
      ok: true,
      build: BUILD_MARK,
      correlationId,
      tnOrderId: Number(tnOrderId),
      paymentId,
      matchRule,
      matchConfidence: confidence,
      paymentPickRule,
      gasStatus: gasRes.status,
      gasParsed: gasRes.parsed,
      gasText: gasRes.parsed ? undefined : gasRes.text,
    });
  } catch (err: any) {
    const status = Number(err?.status) || 500;
    return json(status, {
      ok: false,
      build: BUILD_MARK,
      correlationId,
      error: status === 401 ? "unauthorized" : "internal_error",
      message: String(err?.message ?? err),
    });
  }
}