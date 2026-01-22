// app/api/tiendanube/orders-paid/route.ts
import { NextResponse } from "next/server";
import { getSheets, SPREADSHEET_ID } from "@/lib/googleSheets";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Webhook "orders paid" -> crea Remito en tu ERP (Apps Script)
 *
 * Requiere env:
 * - APPS_SCRIPT_URL
 * - APPS_SCRIPT_TOKEN (si tu GAS lo valida)
 *
 * Reglas de negocio (alineadas al importador):
 * - Exportar TODAS las órdenes pagadas, tengan o no SKUs "-SCNL"
 * - 1 prenda = 1 fila (expand qty)
 * - Owner por SKU:
 *   - sku termina en "-SCNL" => owner = "SCNL"
 *   - caso contrario         => owner = ""   (vacío)
 * - Anti-duplicado por "Detalle general" conteniendo "TN_ORDER_ID=<id>"
 */

const GS_URL = (process.env.APPS_SCRIPT_URL ?? "").trim();
const GS_TOKEN = (process.env.APPS_SCRIPT_TOKEN ?? "").trim();

// Cache (evita pegarle a la fila 1 en cada webhook)
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
    // tolerante: "23.490,00" -> "23490.00"
    const s = v.replace(/\./g, "").replace(",", ".");
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
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

  return {
    name: fullName || "Cliente Tiendanube",
    dni: safeString(c?.identification || c?.dni),
    province: safeString(c?.province),
    city: safeString(c?.city),
    phone: safeString(c?.phone),
  };
}

function buildERPDataFromTNWebhook_(body: any) {
  const orderId = body?.id;
  const items = Array.isArray(body?.items) ? body.items : [];
  const client = pickClient_(body);

  const expandedItems = items.flatMap((i: any) => {
    const qty = safeNumber(i?.quantity);
    const sku = safeString(i?.sku);
    if (!sku || qty <= 0) return [];

    const articulo = safeString(i?.name || i?.product_name);

    // NOTA: talle de TN no es confiable; lo dejás igual (el GAS/stock lo resuelve por SKU)
    const talle =
      safeString(i?.variant?.attributes?.talle) ||
      safeString(i?.variant?.attributes?.size) ||
      "";

    const precioUnitario = normalizeMoney(i?.unit_price ?? i?.price ?? 0);
    const owner = ownerFromSku_(sku);

    return Array.from({ length: qty }).map(() => ({
      sku,
      articulo,
      talle,
      cantidad: 1,
      precioUnitario,
      owner, // "SCNL" o ""
    }));
  });

  const subtotal = normalizeMoney(body?.subtotal ?? body?.subtotal_price ?? 0);
  const costoEnvio = normalizeMoney(body?.shipping_cost ?? body?.shipping_price ?? 0);
  const totalFinal = normalizeMoney(body?.total ?? body?.total_price ?? 0);

  const fechaISO = safeString(body?.paid_at || body?.created_at || new Date().toISOString());

  return {
    fechaISO,
    nombre: client.name,
    dni: client.dni,
    localidad: `${client.province} - ${client.city}`.trim(),
    telefono: client.phone,

    transporte: safeString(body?.shipping_option || body?.shipping_option_name) || "Tiendanube",
    metodoPago: safeString(body?.gateway || body?.payment_method) || "Tiendanube",
    vendedor: "Tiendanube",
    condicionCompra: "Minorista",
    estado: "Pagado",

    subtotal,
    costoEnvio,
    totalFinal,

    recargoDescuento: 0,
    detalleGeneral: `TN_ORDER_ID=${safeString(orderId)}`,

    items: expandedItems,
  };
}

async function saveRemitoToERP_(data: any) {
  if (!GS_URL) throw new Error("APPS_SCRIPT_URL no configurada.");

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 20_000);

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

    return json({ ok: true, orderId, remitoId: erpResp?.id ?? null }, 200);
  } catch (err: any) {
    const msg =
      err?.name === "AbortError"
        ? "Timeout conectando con Apps Script"
        : String(err?.message || err);

    return json({ ok: false, error: msg }, 500);
  }
}
