// app/api/tiendanube/import-orders/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSheets, SPREADSHEET_ID } from "@/lib/googleSheets";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// ===== ENV =====
const TN_API_BASE = "https://api.tiendanube.com/v1";
const TN_STORE_ID = (process.env.TN_STORE_ID ?? "").trim();
const TN_TOKEN = (process.env.TN_ACCESS_TOKEN ?? "").trim();
const TN_UA = (process.env.TN_USER_AGENT ?? "8Q ERP Importer").trim();

const GS_URL = (process.env.APPS_SCRIPT_URL ?? "").trim();
const GS_TOKEN = (process.env.APPS_SCRIPT_TOKEN ?? "").trim();

// ===== Request schema =====
const BodySchema = z.object({
  from: z.string().min(10), // "YYYY-MM-DD" o ISO
  to: z.string().min(10),
  dryRun: z.boolean().optional().default(false),
  limit: z.number().int().positive().max(5000).optional().default(5000),
  force: z.boolean().optional().default(false),
});

function json(body: any, status = 200) {
  return new NextResponse(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

// ===== Tiendanube helpers =====
function tnHeaders() {
  if (!TN_STORE_ID || !TN_TOKEN) {
    throw new Error("Faltan envs TN_STORE_ID / TN_ACCESS_TOKEN");
  }
  return {
    Authentication: `bearer ${TN_TOKEN}`,
    "User-Agent": TN_UA,
    "Content-Type": "application/json",
  } as Record<string, string>;
}

async function tnFetch(path: string, params?: Record<string, any>) {
  const url = new URL(`${TN_API_BASE}/${encodeURIComponent(TN_STORE_ID)}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === "") continue;
      url.searchParams.set(k, String(v));
    }
  }

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: tnHeaders(),
    cache: "no-store",
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`Tiendanube ${res.status}: ${text.slice(0, 300)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Tiendanube devolvió JSON inválido: ${text.slice(0, 300)}`);
  }
}

// ===== Sheets anti-duplicado =====
async function getDetalleGeneralColumnIndex_() {
  const sheets = getSheets();
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `REMITOS!1:1`,
  });
  const header = (resp.data.values?.[0] ?? []).map((x) => String(x || "").trim());
  const idx = header.findIndex((h) => h.toLowerCase() === "detalle general");
  return idx; // 0-based
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

async function existsTNOrderInRemitos_(orderId: number | string) {
  const idx = await getDetalleGeneralColumnIndex_();
  if (idx < 0) throw new Error('No encuentro columna "Detalle general" en REMITOS.');

  const colLetter = colToA1_(idx + 1);
  const sheets = getSheets();

  // columna completa desde fila 2
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `REMITOS!${colLetter}2:${colLetter}`,
  });

  const rows = resp.data.values ?? [];
  const needle = `TN_ORDER_ID=${String(orderId).trim()}`;

  for (const r of rows) {
    const v = String(r?.[0] ?? "");
    if (v.includes(needle)) return true;
  }
  return false;
}

// ===== Contrato ERP =====
function buildERPDataFromTNOrder_(order: any) {
  const client = order.customer || order.client || {};
  const items = Array.isArray(order.items) ? order.items : [];

  const expandedItems = items.flatMap((i: any) => {
    const qty = Number(i.quantity ?? 0) || 0;
    const sku = String(i.sku ?? "").trim();
    const articulo = String(i.name ?? "").trim();
    const precioUnitario = i.unit_price ?? i.price ?? 0;

    if (!sku || qty <= 0) return [];
    return Array.from({ length: qty }).map(() => ({
      sku,
      articulo,
      precioUnitario,
      talle: i.variant?.attributes?.talle || "",
      cantidad: 1,
    }));
  });

  const fullName = `${client.name || ""} ${client.surname || ""}`.trim();

  return {
    fechaISO: order.created_at,
    nombre: fullName || "Cliente Tiendanube",
    dni: client.identification || "",
    localidad: `${client.province || ""} - ${client.city || ""}`.trim(),
    telefono: client.phone || "",

    transporte: order.shipping_option || "Tiendanube",
    metodoPago: order.gateway || "Tiendanube",
    vendedor: "Tiendanube",
    condicionCompra: "Minorista",

    totales: {
      subtotal: Number(order.subtotal ?? 0),
      costoEnvio: Number(order.shipping_cost ?? 0),
      totalFinal: Number(order.total ?? 0),
    },

    recargoDescuento: 0,
    detalleGeneral: `TN_ORDER_ID=${order.id}`,
    estado: "Pagado",

    items: expandedItems,
  };
}

// ===== Guardar en ERP Apps Script =====
async function saveRemitoToERP_(data: any) {
  if (!GS_URL) throw new Error("APPS_SCRIPT_URL no configurada");

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 15_000);

  const payload = { action: "saveRemito", token: GS_TOKEN, data };

  const res = await fetch(GS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    signal: controller.signal,
    body: JSON.stringify(payload),
  }).catch((e) => {
    throw new Error(`Fetch Apps Script falló: ${e?.message || e}`);
  });

  clearTimeout(t);

  const text = await res.text().catch(() => "");
  let parsed: any = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    // ignore
  }

  if (!res.ok || !parsed?.ok) {
    throw new Error(
      `ERP Apps Script error ${res.status}: ${(parsed?.error || text || "")
        .toString()
        .slice(0, 300)}`
    );
  }

  return parsed; // { ok:true, id }
}

// ===== Paid detector (robusto) =====
function isOrderPaid_(order: any) {
  const paymentStatus = String(order.payment_status ?? order.paymentStatus ?? "").toLowerCase();
  const status = String(order.status ?? "").toLowerCase();

  // intentamos cubrir variantes comunes
  if (paymentStatus === "paid" || paymentStatus === "paid_out") return true;
  if (status === "paid") return true;

  // algunos gateways pueden marcar "authorized" antes de "paid"
  // si no querés esto, lo sacamos.
  if (paymentStatus === "authorized") return true;

  return false;
}

// ===== Endpoint =====
export async function POST(req: Request) {
  try {
    const body = BodySchema.parse(await req.json().catch(() => ({})));

    const fromDate = new Date(body.from);
    const toDate = new Date(body.to);
    if (isNaN(+fromDate) || isNaN(+toDate)) return json({ ok: false, error: "from/to inválidos" }, 400);
    if (fromDate > toDate) return json({ ok: false, error: "from no puede ser mayor que to" }, 400);

    if (!TN_STORE_ID || !TN_TOKEN) {
      return json({ ok: false, error: "Faltan envs de Tiendanube (TN_STORE_ID/TN_ACCESS_TOKEN)" }, 500);
    }
    if (!SPREADSHEET_ID) {
      return json({ ok: false, error: "Falta GOOGLE_SPREADSHEET_ID" }, 500);
    }

    const perPage = 50;
    let page = 1;

    const report = {
      ok: true,
      dryRun: body.dryRun,
      from: body.from,
      to: body.to,
      fetched: 0,
      inRange: 0,
      consideredPaid: 0,
      imported: 0,
      skippedDuplicate: 0,
      skippedNotPaid: 0,
      failed: 0,
      failures: [] as Array<{ orderId: any; error: string }>,
      importedIds: [] as Array<{ orderId: any; remitoId: string | null }>,
    };

    // loop de páginas
    while (report.consideredPaid < body.limit) {
      const orders = await tnFetch("/orders", { page, per_page: perPage });

      if (!Array.isArray(orders) || orders.length === 0) break;

      report.fetched += orders.length;

      for (const order of orders) {
        if (report.consideredPaid >= body.limit) break;

        const createdAt = new Date(order.created_at);
        if (isNaN(+createdAt)) continue;

        // rango
