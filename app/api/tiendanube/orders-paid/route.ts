// app/api/tiendanube/orders-paid/route.ts
import { NextResponse } from "next/server";
import { getSheets, SPREADSHEET_ID } from "@/lib/googleSheets";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const GS_URL = (process.env.APPS_SCRIPT_URL ?? "").trim();
const GS_TOKEN = (process.env.APPS_SCRIPT_TOKEN ?? "").trim();

// Cache columna "Detalle general"
let _detalleGeneralIdxPromise: Promise<number> | null = null;

function json(body: any, status = 200) {
  return new NextResponse(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function safeString(v: any) {
  return String(v ?? "").trim();
}
function safeNumber(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function normalizeMoney(v: any): number {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const s = v.replace(/\./g, "").replace(",", ".");
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}
function getMetodoPagoVal(order: any): string {
  // 1) intenta encontrar cuotas
  const installments =
    Number(order?.payment_details?.installments ?? order?.installments ?? order?.payments?.[0]?.installments ?? 0) || 0;

  // 2) intenta detectar “tipo” (crédito/débito/transfer)
  const raw =
    String(
      order?.payment_details?.method ||
      order?.payment_details?.payment_method ||
      order?.payment_details?.payment_type ||
      order?.payment_method ||
      order?.gateway ||
      order?.payment_gateway ||
      order?.payments?.[0]?.gateway ||
      order?.payments?.[0]?.payment_method ||
      order?.payment_details?.name ||
      order?.payment_method_name ||
      order?.payment_method_id ||
      ""
    ).toLowerCase().trim();

  // 3) normalización transferencia / custom
  if (raw.includes("transfer") || raw.includes("bank") || raw.includes("cbu") || raw.includes("alias")) {
    return "TRANSFERENCIA";
  }
  if (raw === "custom") {
    // muchas tiendas usan custom para transferencia/efectivo: si querés, acá podés afinar
    return "CUSTOM";
  }

  // 4) mercado pago / tiendanube payments / tarjeta
  const isMP = raw.includes("mercado") || raw.includes("mp");
  const isCard = raw.includes("card") || raw.includes("tarjeta") || raw.includes("credit") || raw.includes("debit");

  const isDebit = raw.includes("debit") || raw.includes("debito");
  const isCredit = raw.includes("credit") || raw.includes("credito");

  if (isMP) {
    if (isDebit) return "MP - DÉBITO";
    if (isCredit) return installments > 1 ? `MP - CRÉDITO ${installments} CUOTAS` : "MP - CRÉDITO 1 CUOTA";
    // fallback MP
    return installments > 1 ? `MP - ${installments} CUOTAS` : "MP";
  }

  if (raw.includes("tiendanube") || raw.includes("nube")) {
    if (isDebit) return "TIENDANUBE PAYMENTS - DÉBITO";
    if (isCredit) return installments > 1 ? `TIENDANUBE PAYMENTS - CRÉDITO ${installments} CUOTAS` : "TIENDANUBE PAYMENTS - CRÉDITO 1 CUOTA";
    return "TIENDANUBE PAYMENTS";
  }

  if (isCard) {
    if (isDebit) return "TARJETA - DÉBITO";
    if (isCredit) return installments > 1 ? `TARJETA - CRÉDITO ${installments} CUOTAS` : "TARJETA - CRÉDITO 1 CUOTA";
    return installments > 1 ? `TARJETA - ${installments} CUOTAS` : "TARJETA";
  }

  // 5) último fallback: algo legible
  return raw ? raw.toUpperCase() : "";
}

function colToA1_(colIndex1Based: number) {
  let n = colIndex1Based;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

async function getDetalleGeneralColumnIndex_() {
  if (_detalleGeneralIdxPromise) return _detalleGeneralIdxPromise;

  _detalleGeneralIdxPromise = (async () => {
    const sheets = getSheets();
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `REMITOS!1:1`,
    });

    const header = (resp.data.values?.[0] ?? []).map((x) =>
      safeString(x).toLowerCase()
    );
    const idx = header.findIndex((h) => h === "detalle general");

    if (idx < 0) {
      _detalleGeneralIdxPromise = null;
      throw new Error('No encuentro columna "Detalle general" en REMITOS (fila 1).');
    }
    return idx;
  })();

  return _detalleGeneralIdxPromise;
}

async function existsTNOrderInRemitos_(orderId: number | string) {
  const idx = await getDetalleGeneralColumnIndex_();
  const colLetter = colToA1_(idx + 1);

  const sheets = getSheets();
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `REMITOS!${colLetter}2:${colLetter}`,
    majorDimension: "ROWS",
  });

  const rows = resp.data.values ?? [];
  const needle = `TN_ORDER_ID=${safeString(orderId)}`;

  for (const r of rows) {
    const v = safeString(r?.[0]);
    if (v.includes(needle)) return true;
  }
  return false;
}

function isSCNLsku(sku: string) {
  return safeString(sku).toUpperCase().endsWith("-SCNL");
}
function ownerFromSku_(sku: string) {
  return isSCNLsku(sku) ? "SCNL" : "";
}

function pickClient_(body: any) {
  const c = body?.customer || body?.client || {};
  const fullName = `${safeString(c?.name)} ${safeString(c?.surname)}`.trim();

  // OJO: algunos webhooks traen address separado
  const province =
    safeString(c?.province) ||
    safeString(body?.shipping_address?.province) ||
    safeString(body?.billing_address?.province);

  const city =
    safeString(c?.city) ||
    safeString(body?.shipping_address?.city) ||
    safeString(body?.billing_address?.city);

  return {
    name: fullName || "Cliente Tiendanube",
    dni: safeString(c?.identification || c?.dni),
    province,
    city,
    phone:
      safeString(c?.phone) ||
      safeString(body?.shipping_address?.phone) ||
      safeString(body?.billing_address?.phone),
  };
}

function pickOrderDateISO_(body: any) {
  return (
    safeString(body?.paid_at) ||
    safeString(body?.updated_at) ||
    safeString(body?.created_at) ||
    new Date().toISOString()
  );
}

/**
 * Construye payload compatible con tu saveRemito() actual (GAS):
 * - totales: {subtotal, costoEnvio, costoEnvioOwner, totalFinal, feeTotal}
 * - items: {sku, articulo, talle, cantidad, precioUnitario, owner}
 */
function buildERPDataFromTNWebhook_(body: any) {
  const orderId = body?.id;
  const items = Array.isArray(body?.items) ? body.items : [];
  const client = pickClient_(body);

  const expandedItems = items.flatMap((i: any) => {
    const qty = safeNumber(i?.quantity);
    const sku = safeString(i?.sku).toUpperCase();
    if (!sku || qty <= 0) return [];

    const articulo = safeString(i?.name || i?.product_name);

    // Si TN trae variant attributes, lo mandamos, pero GAS igual revalida por SKU/maestro
    const talle =
      safeString(i?.variant?.attributes?.talle) ||
      safeString(i?.variant?.attributes?.size) ||
      safeString(i?.variant_name) ||
      "";

    // En webhooks, a veces viene "unit_price" o "price"
    const precioUnitario = normalizeMoney(i?.unit_price ?? i?.price ?? 0);
    const owner = ownerFromSku_(sku);

    return Array.from({ length: qty }).map(() => ({
      sku,
      articulo,
      talle,
      cantidad: 1,
      precioUnitario, // BRUTO (lo mejor posible con lo que trae webhook)
      owner,
    }));
  });

  // Totales (en webhook pueden variar; normalizamos y mandamos en "totales")
  const subtotal = normalizeMoney(body?.subtotal ?? body?.subtotal_price ?? 0);
  const costoEnvio = normalizeMoney(body?.shipping_cost ?? body?.shipping_price ?? 0);
  const totalFinal = normalizeMoney(body?.total ?? body?.total_price ?? 0);

  // Si el cliente no pagó envío (costoEnvio=0), por ahora dejamos costoEnvioOwner=0.
  // Más adelante lo podés poblar con tu tabla de costos/logística.
  const costoEnvioOwner = 0;

  // Fee total (si no lo tenés, 0). En import masivo lo vamos a calcular/mejorar.
  const feeTotal = 0;

  const fechaISO = pickOrderDateISO_(body);

  return {
    fechaISO,

    nombre: client.name,
    dni: client.dni,
    provincia: client.province,
    localidad: client.city,
    telefono: client.phone,

    transporte:
      safeString(body?.shipping_option_name) ||
      safeString(body?.shipping_option) ||
      "Tiendanube",

    metodoPago:
      safeString(body?.gateway) ||
      safeString(body?.payment_method) ||
      "Tiendanube",

    vendedor: "Tiendanube",
    condicionCompra: "Minorista",
    estado: "Pagado",

    // NUEVO: totales (lo que espera tu GAS actualizado)
    totales: {
      subtotal,
      costoEnvio,
      costoEnvioOwner,
      feeTotal,
      totalFinal,
    },

    // Mantengo compat por si algún bloque usa los viejos (no molesta)
    subtotal,
    costoEnvio,
    totalFinal,

    // Si más adelante querés usarlo, lo mandamos explícito
    recargoDescuento: 0,

    detalleGeneral: `TN_ORDER_ID=${safeString(orderId)}`,

    items: expandedItems,
  };
}

async function saveRemitoToERP_(data: any) {
  if (!GS_URL) throw new Error("APPS_SCRIPT_URL no configurada.");

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 25_000);

  const res = await fetch(GS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    signal: controller.signal,
    body: JSON.stringify({
      action: "saveRemito",
      token: GS_TOKEN,
      data,
    }),
  });

  clearTimeout(t);

  const text = await res.text().catch(() => "");
  let parsed: any = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }

  if (!res.ok || !parsed?.ok) {
    throw new Error(
      `ERP Apps Script error ${res.status}: ${safeString(parsed?.error || text).slice(0, 300)}`
    );
  }

  return parsed;
}

export async function POST(req: Request) {
  try {
    if (!GS_URL) return json({ ok: false, error: "Falta APPS_SCRIPT_URL" }, 500);

    const body = await req.json().catch(() => ({} as any));
    const orderId = body?.id;
    if (!orderId) return json({ ok: false, error: "Webhook sin body.id" }, 400);

    const status = safeString(body?.status).toLowerCase();
    if (status && status !== "paid") {
      return json({ ok: true, skipped: true, reason: "status_not_paid", status, orderId }, 200);
    }

    const exists = await existsTNOrderInRemitos_(orderId);
    if (exists) return json({ ok: true, duplicated: true, orderId }, 200);

    const data = buildERPDataFromTNWebhook_(body);

    if (!Array.isArray(data.items) || data.items.length === 0) {
      return json({ ok: true, skipped: true, reason: "no_items", orderId }, 200);
    }

    const erpResp = await saveRemitoToERP_(data);

    return json(
      { ok: true, orderId, remitoId: erpResp?.id ?? null, apiVersion: erpResp?.apiVersion ?? null },
      200
    );
  } catch (err: any) {
    const msg =
      err?.name === "AbortError"
        ? "Timeout conectando con Apps Script"
        : String(err?.message || err);

    return json({ ok: false, error: msg }, 500);
  }
}
