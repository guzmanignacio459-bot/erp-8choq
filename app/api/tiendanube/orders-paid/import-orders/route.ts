// app/api/tiendanube/orders-paid/import-orders/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Marcador de build (solo informativo)
const BUILD_MARK = "IMPORT_ORDERS_TN_BATCH__2026_01_06__A";

const EXPECTED = (
  process.env.TIENDANUBE_IMPORT_TOKEN ??
  process.env.IMPORT_ORDERS_TOKEN ??
  process.env.IMPORT_TOKEN ??
  ""
).trim();

const TIENDANUBE_API_URL = (process.env.TIENDANUBE_API_URL ?? "https://api.tiendanube.com/v1").trim();
const TIENDANUBE_STORE_ID = (process.env.TIENDANUBE_STORE_ID ?? "").trim();
const TIENDANUBE_ACCESS_TOKEN = (process.env.TIENDANUBE_ACCESS_TOKEN ?? "").trim();
const TIENDANUBE_USER_AGENT = (process.env.TIENDANUBE_USER_AGENT ?? "8Q ERP Importer").trim();

const APPS_SCRIPT_URL = (process.env.APPS_SCRIPT_URL ?? "").trim();
const APPS_SCRIPT_TOKEN = (process.env.APPS_SCRIPT_TOKEN ?? "").trim();

// Ajustá si tu catálogo tiene XS u otros talles
const VALID_SIZES = new Set(["S", "M", "L", "XL", "XXL", "XXXL"] as const);

type ImportBody = {
  fromISO: string;
  toISO: string;

  dryRun?: boolean;
  fetchDetails?: boolean;
  perPage?: number;
  throttleMs?: number;
  maxPages?: number;

  // Modo 1 orden (debug / reparación puntual)
  orderId?: string | number; // legacy
  singleOrderId?: string | number; // alias nuevo

  debugRaw?: boolean; // logs (Vercel)
  includeOrderJson?: boolean; // incluye JSON crudo en response (single)
};

function toNumberSafe(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function firstNonEmpty(...vals: any[]) {
  for (const v of vals) {
    if (v === null || v === undefined) continue;
    const s = String(v).trim();
    if (s !== "" && s !== "null" && s !== "undefined") return s;
  }
  return "";
}

/**
 * Transporte / Envío: nombre del método de envío (carrier / opción).
 */
function getShippingName(order: any) {
  return firstNonEmpty(
    order?.shipping_option?.name,
    order?.shipping_option?.title,
    order?.shipping_method,
    order?.shipping_method_name,
    order?.shipping_lines?.[0]?.name,
    order?.shipping_lines?.[0]?.title,
    order?.shipping?.name
  );
}

/**
 * Costo de envío cobrado al cliente (va a "Costo De Envío").
 * No es costo interno.
 */
function getShippingPaid(order: any) {
  const raw = firstNonEmpty(
    order?.shipping_cost,
    order?.shipping_total,
    order?.shipping_option?.cost,
    order?.shipping_option?.price,
    order?.shipping_lines?.[0]?.price,
    order?.shipping_lines?.[0]?.cost,
    order?.shipping?.cost
  );
  return toNumberSafe(raw, 0);
}

/**
 * Método de pago: nombre legible del método / gateway.
 * Nota: TN a veces expone strings genéricos (wallet/credit_card/custom).
 * Con debugRaw + includeOrderJson vas a ver exactamente qué viene para mapear fino.
 */
function getPaymentMethod(order: any) {
  return firstNonEmpty(
    order?.payment_details?.payment_method_name,
    order?.payment_details?.provider_name,
    order?.payment_details?.method,
    order?.payment_gateway_names?.[0],
    order?.gateway,
    order?.payment_method_name,
    order?.payment_method
  );
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseMoneyToNumber(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v ?? "").trim();
  if (!s) return 0;

  const clean = s.replace(/[^\d.,-]/g, "");

  // "23.490,00" -> 23490.00
  if (clean.includes(",") && clean.includes(".")) {
    const normalized = clean.replace(/\./g, "").replace(",", ".");
    const n = Number(normalized);
    return Number.isFinite(n) ? n : 0;
  }

  // "234,90" -> 234.90
  if (clean.includes(",") && !clean.includes(".")) {
    const n = Number(clean.replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }

  // "234900" o "234900.00"
  const n = Number(clean);
  return Number.isFinite(n) ? n : 0;
}

function parseSkuOwnerSize(skuRaw: unknown): { sku: string; owner: "" | "SCNL"; size: string | null } {
  const sku = String(skuRaw ?? "").trim().toUpperCase();
  if (!sku) return { sku: "", owner: "", size: null };

  const parts = sku.split("-").filter(Boolean);
  let owner: "" | "SCNL" = "";
  if (parts.length && parts[parts.length - 1].toUpperCase() === "SCNL") {
    owner = "SCNL";
    parts.pop();
  }

  const last = parts.length ? parts[parts.length - 1].toUpperCase() : "";
  const size = VALID_SIZES.has(last as any) ? last : null;

  return { sku, owner, size };
}

function pickOrderDateISO(order: any): string {
  const paid =
    order?.paid_at ??
    order?.payment_date ??
    order?.payment?.paid_at ??
    order?.payments?.[0]?.paid_at;

  if (paid) {
    const d = new Date(paid);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }

  const fallbacks = [order?.updated_at, order?.created_at, order?.createdAt, order?.date];
  for (const f of fallbacks) {
    if (!f) continue;
    const d = new Date(f);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }

  return new Date().toISOString();
}

function isPaid(order: any): boolean {
  const ps = String(order?.payment_status ?? "").toLowerCase();
  const st = String(order?.status ?? "").toLowerCase();

  if (ps === "paid" || ps === "pagado") return true;
  if (st === "paid" || st === "pagado") return true;

  if (order?.paid_at) return true;
  return false;
}

function inRange(iso: string, fromISO: string, toISO: string): boolean {
  const t = new Date(iso).getTime();
  const a = new Date(fromISO).getTime();
  const b = new Date(toISO).getTime();
  if (!Number.isFinite(t) || !Number.isFinite(a) || !Number.isFinite(b)) return false;
  return t >= a && t <= b;
}

type RemitoItem = {
  sku: string;
  articulo: string;
  talle: string;
  cantidad: 1;
  precioUnitario: number;
  owner: "" | "SCNL";
};

function expandOrderItemsToUnitRows(order: any): { items: RemitoItem[]; errors: string[] } {
  const errors: string[] = [];
  const out: RemitoItem[] = [];

  const products: any[] = Array.isArray(order?.products) ? order.products : [];
  if (!products.length) {
    errors.push(`order_id=${order?.id ?? "?"}: sin products`);
    return { items: [], errors };
  }

  for (const p of products) {
    const skuRaw = p?.sku ?? p?.variant_sku ?? p?.product_sku ?? "";
    const { sku, owner, size } = parseSkuOwnerSize(skuRaw);

    if (!sku) {
      errors.push(`order_id=${order?.id ?? "?"}: item sin sku (name=${String(p?.name ?? "")})`);
      continue;
    }

    if (!size) {
      errors.push(`order_id=${order?.id ?? "?"}: SKU sin talle válido (sku=${sku})`);
      continue;
    }

    const articulo = String(p?.name ?? p?.product_name ?? p?.title ?? "").trim() || sku;

    const qty = Number(p?.quantity ?? 0);
    if (!Number.isFinite(qty) || qty <= 0) {
      errors.push(`order_id=${order?.id ?? "?"}: quantity inválida (sku=${sku}, qty=${String(p?.quantity)})`);
      continue;
    }

    const priceRaw = p?.price ?? p?.unit_price ?? p?.variant_price ?? p?.product_price ?? 0;
    const precioUnitario = parseMoneyToNumber(priceRaw);

    for (let i = 0; i < qty; i++) {
      out.push({
        sku,
        articulo,
        talle: size,
        cantidad: 1,
        precioUnitario,
        owner,
      });
    }
  }

  return { items: out, errors };
}

function buildRemitoPayload(order: any): { data: any; itemErrors: string[] } {
  const fechaISO = pickOrderDateISO(order);

  const firstName = String(order?.customer?.firstname ?? order?.customer?.first_name ?? "").trim();
  const lastName = String(order?.customer?.lastname ?? order?.customer?.last_name ?? "").trim();
  const nombre =
    [firstName, lastName].filter(Boolean).join(" ").trim() ||
    String(order?.customer?.name ?? order?.billing_address?.name ?? "").trim();

  const email = String(order?.customer?.email ?? order?.email ?? "").trim();
  const telefono = String(order?.customer?.phone ?? order?.phone ?? order?.shipping_address?.phone ?? "").trim();

  const provincia = String(order?.shipping_address?.province ?? order?.shipping_address?.state ?? "").trim();
  const localidad = String(order?.shipping_address?.city ?? order?.shipping_address?.locality ?? "").trim();
  const dni = String(
    order?.customer?.identification ?? order?.billing_address?.dni ?? order?.billing_address?.identification ?? ""
  ).trim();

  const subtotal = parseMoneyToNumber(order?.subtotal ?? order?.subtotal_price ?? order?.total_products ?? 0);
  const totalFinal = parseMoneyToNumber(order?.total ?? order?.total_price ?? order?.total_paid ?? 0);

  const shippingName = getShippingName(order) || "Sin dato";
  const shippingPaid = getShippingPaid(order);
  const paymentMethod = getPaymentMethod(order) || "Sin dato";

  const detalleGeneral = `TN_ORDER_ID=${String(order?.id ?? "").trim()}`;

  const { items, errors } = expandOrderItemsToUnitRows(order);

  const data = {
    fechaISO,
    nombre,
    dni,
    localidad,
    provincia,
    email,
    telefono,

    subtotal,
    shipping: shippingPaid,
    totalFinal,

    detalleGeneral,
    items,

    vendedor: "Tiendanube",
    transporte: shippingName,
    metodoPago: paymentMethod,
    condicionCompra: "Minorista",
    estado: "Pagado",
  };

  return { data, itemErrors: errors };
}

async function tnFetch(
  path: string,
  timeoutMs = 12000
): Promise<{ ok: boolean; status: number; text: string; json: any }> {
  const url = `${TIENDANUBE_API_URL}/${encodeURIComponent(TIENDANUBE_STORE_ID)}${path}`;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authentication: `bearer ${TIENDANUBE_ACCESS_TOKEN}`,
        "User-Agent": TIENDANUBE_USER_AGENT,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: controller.signal,
    });

    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    return { ok: res.ok, status: res.status, text, json };
  } catch (e: any) {
    const msg = e?.name === "AbortError" ? `Fetch timeout after ${timeoutMs}ms` : String(e?.message ?? e);
    return { ok: false, status: 599, text: msg, json: null };
  } finally {
    clearTimeout(t);
  }
}

async function tnFetchOrderDetail(orderId: string | number) {
  return tnFetch(`/orders/${encodeURIComponent(String(orderId))}`);
}

async function callAppsScriptSaveRemito(data: any): Promise<any> {
  if (!APPS_SCRIPT_URL) throw new Error("APPS_SCRIPT_URL faltante");

  const body = {
    action: "saveRemito",
    token: APPS_SCRIPT_TOKEN || undefined,
    data,
  };

  const res = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { ok: false, error: "Invalid JSON from Apps Script", raw: text };
  }

  if (!res.ok || !json?.ok) {
    throw new Error(`AppsScript error: http=${res.status} body=${text}`);
  }

  return json;
}

function normalizeOptionalId(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v).trim();
  return s;
}

export async function POST(req: Request) {
  // ===== Auth: x-import-token =====
  const incoming = (req.headers.get("x-import-token") ?? "").trim();
  if (!EXPECTED || incoming !== EXPECTED) {
    return NextResponse.json({ ok: false, step: "unauthorized", build: BUILD_MARK }, { status: 401 });
  }

  // ===== Env checks =====
  const missing: string[] = [];
  if (!TIENDANUBE_STORE_ID) missing.push("TIENDANUBE_STORE_ID");
  if (!TIENDANUBE_ACCESS_TOKEN) missing.push("TIENDANUBE_ACCESS_TOKEN");
  if (!APPS_SCRIPT_URL) missing.push("APPS_SCRIPT_URL");
  if (missing.length) {
    return NextResponse.json({ ok: false, error: "Missing env vars", missing, build: BUILD_MARK }, { status: 500 });
  }

  // ===== Parse body =====
  let body: ImportBody;
  try {
    body = (await req.json()) as ImportBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Body JSON inválido", build: BUILD_MARK }, { status: 400 });
  }

  // ===== Query params (opcional) =====
  const url = new URL(req.url);
  const qp = url.searchParams;

  const qpOrderId = normalizeOptionalId(qp.get("singleOrderId") || qp.get("orderId") || "");
  const qpDryRun = qp.get("dryRun") === "true";
  const qpDebugRaw = qp.get("debugRaw") === "true";
  const qpIncludeOrderJson = qp.get("includeOrderJson") === "true";

  // ===== Required range =====
  const fromISO = String(body.fromISO ?? "").trim();
  const toISO = String(body.toISO ?? "").trim();
  if (!fromISO || !toISO) {
    return NextResponse.json({ ok: false, error: "fromISO y toISO son requeridos", build: BUILD_MARK }, { status: 400 });
  }

  // ===== Flags =====
  const dryRun = qpDryRun ? true : !!body.dryRun;
  const debugRaw = qpDebugRaw ? true : !!body.debugRaw;
  const includeOrderJson = qpIncludeOrderJson ? true : !!body.includeOrderJson;

  // batch tuning
  const fetchDetails = !!body.fetchDetails;
  const perPage = Math.max(1, Math.min(200, Number(body.perPage ?? 50)));
  const throttleMs = Math.max(0, Number(body.throttleMs ?? 350));
  const maxPages = Math.max(1, Number(body.maxPages ?? 50));

  // ===== Single order resolution (CRÍTICO: si viene, NO debe ejecutar batch) =====
  const rawBodySingle = body.singleOrderId;
  const rawBodyLegacy = body.orderId;

  const orderIdSingle = normalizeOptionalId(
    qpOrderId ||
      (rawBodySingle !== undefined && rawBodySingle !== null ? rawBodySingle : "") ||
      (rawBodyLegacy !== undefined && rawBodyLegacy !== null ? rawBodyLegacy : "")
  );

  // Si el cliente mandó explícitamente una key de id pero vacía => error
  const bodyIdWasProvided =
    body.singleOrderId !== undefined ||
    body.orderId !== undefined ||
    qp.has("singleOrderId") ||
    qp.has("orderId");

  if (bodyIdWasProvided && !orderIdSingle) {
    return NextResponse.json(
      {
        ok: false,
        step: "bad_orderId",
        message: "orderId/singleOrderId llegó vacío o inválido",
        build: BUILD_MARK,
        received: {
          qpOrderId: qp.get("singleOrderId") ?? qp.get("orderId"),
          bodySingleOrderId: body.singleOrderId,
          bodyOrderId: body.orderId,
        },
      },
      { status: 400 }
    );
  }

  console.log("[IMPORT_ORDERS] BUILD:", BUILD_MARK);
  console.log("[IMPORT_ORDERS] singleOrder resolved:", orderIdSingle || "(none)");
  console.log("[IMPORT_ORDERS] flags:", { dryRun, debugRaw, includeOrderJson, fetchDetails, perPage, throttleMs, maxPages });

  const errors: Array<{ orderId?: string; step: string; message: string }> = [];

  let consideredPaid = 0;
  let consideredInRange = 0;

  let wouldImport = 0;
  let imported = 0;
  let duplicated = 0;

  const processedOrderIds: string[] = [];

  // =========================
  // ====== MODO 1 ORDEN ======
  // =========================
  if (orderIdSingle) {
    try {
      const det = await tnFetchOrderDetail(orderIdSingle);
      if (!det.ok) {
        return NextResponse.json(
          { ok: false, step: "tn_order_detail", orderId: orderIdSingle, status: det.status, body: det.text, build: BUILD_MARK },
          { status: 200 }
        );
      }

      const order = det.json;

      if (debugRaw) {
        const extract = {
          id: order?.id,
          status: order?.status,
          payment_status: order?.payment_status,
          paid_at: order?.paid_at,
          payment_date: order?.payment_date,
          payment_gateway_names: order?.payment_gateway_names,
          payment_details: order?.payment_details,
          payments_0: Array.isArray(order?.payments) ? order.payments?.[0] : undefined,
          shipping_option: order?.shipping_option,
          shipping_lines: order?.shipping_lines,
          shipping_cost: order?.shipping_cost,
          shipping_total: order?.shipping_total,
          subtotal: order?.subtotal ?? order?.subtotal_price ?? order?.total_products,
          total: order?.total ?? order?.total_price ?? order?.total_paid,
        };

        console.log("[DEBUG TN ORDER] keys:", Object.keys(order || {}));
        console.log("[DEBUG TN ORDER] extract:", JSON.stringify(extract, null, 2));
      }

      if (!isPaid(order)) {
        return NextResponse.json(
          {
            ok: true,
            build: BUILD_MARK,
            mode: "single_order",
            skipped: true,
            reason: "order_not_paid",
            orderId: String(order?.id ?? orderIdSingle),
            orderDateISO: pickOrderDateISO(order),
            extracted: {
              paymentMethod: getPaymentMethod(order) || "Sin dato",
              shippingName: getShippingName(order) || "Sin dato",
              shippingPaid: getShippingPaid(order),
            },
            ...(includeOrderJson ? { order } : {}),
          },
          { status: 200 }
        );
      }
      consideredPaid++;

      const orderDateISO = pickOrderDateISO(order);
      if (!inRange(orderDateISO, fromISO, toISO)) {
        return NextResponse.json(
          {
            ok: true,
            build: BUILD_MARK,
            mode: "single_order",
            skipped: true,
            reason: "order_out_of_range",
            orderId: String(order?.id ?? orderIdSingle),
            orderDateISO,
            fromISO,
            toISO,
            extracted: {
              paymentMethod: getPaymentMethod(order) || "Sin dato",
              shippingName: getShippingName(order) || "Sin dato",
              shippingPaid: getShippingPaid(order),
            },
            ...(includeOrderJson ? { order } : {}),
          },
          { status: 200 }
        );
      }
      consideredInRange++;

      const { data, itemErrors } = buildRemitoPayload(order);

      if (itemErrors?.length) {
        return NextResponse.json(
          {
            ok: false,
            step: "build_items",
            orderId: String(order?.id ?? orderIdSingle),
            message: itemErrors.join(" | "),
            build: BUILD_MARK,
            extracted: {
              paymentMethod: getPaymentMethod(order) || "Sin dato",
              shippingName: getShippingName(order) || "Sin dato",
              shippingPaid: getShippingPaid(order),
            },
            ...(includeOrderJson ? { order } : {}),
          },
          { status: 200 }
        );
      }

      if (!data || !Array.isArray(data.items) || data.items.length === 0) {
        return NextResponse.json(
          {
            ok: false,
            step: "build_payload",
            orderId: String(order?.id ?? orderIdSingle),
            message: "Payload inválido o sin items",
            build: BUILD_MARK,
            extracted: {
              paymentMethod: getPaymentMethod(order) || "Sin dato",
              shippingName: getShippingName(order) || "Sin dato",
              shippingPaid: getShippingPaid(order),
            },
            ...(includeOrderJson ? { order } : {}),
          },
          { status: 200 }
        );
      }

      wouldImport++;

      let res: any = null;
      if (!dryRun) {
        res = await callAppsScriptSaveRemito(data);
        if (res?.duplicated) duplicated++;
        else imported++;
      }

      processedOrderIds.push(String(order?.id ?? orderIdSingle));

      return NextResponse.json(
        {
          ok: true,
          build: BUILD_MARK,
          mode: "single_order",
          input: {
            orderId: orderIdSingle,
            fromISO,
            toISO,
            dryRun,
            debugRaw,
            includeOrderJson,
          },
          extracted: {
            paymentMethod: getPaymentMethod(order) || "Sin dato",
            shippingName: getShippingName(order) || "Sin dato",
            shippingPaid: getShippingPaid(order),
          },
          metrics: {
            consideredPaid,
            consideredInRange,
            wouldImport,
            imported: dryRun ? 0 : imported,
            duplicated: dryRun ? 0 : duplicated,
            errors: errors.length,
          },
          processedOrderIds,
          result: dryRun ? undefined : res,
          preview: dryRun ? data : undefined,
          ...(includeOrderJson ? { order } : {}),
          errors,
        },
        { status: 200 }
      );
    } catch (e: any) {
      return NextResponse.json(
        { ok: false, step: "single_order", orderId: orderIdSingle, message: String(e?.message ?? e), build: BUILD_MARK },
        { status: 200 }
      );
    }
  }

  // ======================
  // ====== MODO BATCH =====
  // ======================
  let page = 1;

  while (page <= maxPages) {
    const list = await tnFetch(`/orders?page=${page}&per_page=${perPage}`);

    // 404 "Last page is 0" cuando no hay resultados
    if (!list.ok && list.status === 404 && (list.text || "").includes("Last page is 0")) {
      break;
    }

    if (!list.ok) {
      errors.push({ step: "tn_list_orders", message: `status=${list.status} body=${list.text}` });
      break;
    }

    const orders: any[] = Array.isArray(list.json) ? list.json : [];
    if (!orders.length) break;

    for (const o0 of orders) {
      try {
        // 1) Solo órdenes pagadas
        if (!isPaid(o0)) continue;
        consideredPaid++;

        // 2) Rango de fechas (por fecha de pago / pickOrderDateISO)
        const orderDateISO = pickOrderDateISO(o0);
        if (!inRange(orderDateISO, fromISO, toISO)) continue;
        consideredInRange++;

        // 3) Detalle completo si corresponde
        let order = o0;
        if (fetchDetails) {
          const det = await tnFetchOrderDetail(o0?.id);
          if (!det.ok) {
            errors.push({
              orderId: String(o0?.id ?? ""),
              step: "tn_order_detail",
              message: `status=${det.status} body=${det.text}`,
            });
            continue;
          }
          order = det.json;
        }

        // 4) Build payload
        const { data, itemErrors } = buildRemitoPayload(order);

        if (itemErrors?.length) {
          errors.push({
            orderId: String(order?.id ?? ""),
            step: "build_items",
            message: itemErrors.join(" | "),
          });
          continue;
        }

        if (!data || !Array.isArray(data.items) || data.items.length === 0) {
          errors.push({
            orderId: String(order?.id ?? ""),
            step: "build_payload",
            message: "Payload inválido o sin items",
          });
          continue;
        }

        wouldImport++;

        // 5) Guardar en Apps Script
        if (!dryRun) {
          const res = await callAppsScriptSaveRemito(data);
          if (res?.duplicated) duplicated++;
          else imported++;
        }

        processedOrderIds.push(String(order?.id ?? ""));

        if (throttleMs) await sleep(throttleMs);
      } catch (e: any) {
        errors.push({
          orderId: String(o0?.id ?? ""),
          step: "process_order",
          message: String(e?.message ?? e),
        });
        continue;
      }
    }

    // Si vino menos que perPage, era la última
    if (orders.length < perPage) break;

    page++;
    if (throttleMs) await sleep(throttleMs);
  }

  return NextResponse.json(
    {
      ok: true,
      build: BUILD_MARK,
      mode: "batch",
      input: { fromISO, toISO, dryRun, fetchDetails, perPage, throttleMs, maxPages },
      metrics: {
        consideredPaid,
        consideredInRange,
        wouldImport,
        imported: dryRun ? 0 : imported,
        duplicated: dryRun ? 0 : duplicated,
        errors: errors.length,
      },
      processedOrderIds: processedOrderIds.slice(0, 200),
      errors,
    },
    { status: 200 }
  );
}
