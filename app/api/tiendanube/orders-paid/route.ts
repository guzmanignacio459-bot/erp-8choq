// app/api/tiendanube/orders-paid/route.ts
import { NextResponse } from "next/server";
import { getSheets, SPREADSHEET_ID } from "@/lib/googleSheets";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const GS_URL = (process.env.APPS_SCRIPT_URL ?? "").trim();
const GS_TOKEN = (process.env.APPS_SCRIPT_TOKEN ?? "").trim();

function json(body: any, status = 200) {
  return new NextResponse(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

async function getDetalleGeneralColumnIndex_() {
  const sheets = getSheets();
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `REMITOS!1:1`,
  });
  const header = (resp.data.values?.[0] ?? []).map((x) => String(x || "").trim());
  return header.findIndex((h) => h.toLowerCase() === "detalle general");
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

function buildERPDataFromTNWebhook_(body: any) {
  const orderId = body.id;
  const items = Array.isArray(body.items) ? body.items : [];
  const client = body.customer || body.client || {};

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
    fechaISO: body.created_at,
    nombre: fullName || "Cliente Tiendanube",
    dni: client.identification || "",
    localidad: `${client.province || ""} - ${client.city || ""}`.trim(),
    telefono: client.phone || "",

    transporte: body.shipping_option || "Tiendanube",
    metodoPago: body.gateway || "Tiendanube",
    vendedor: "Tiendanube",
    condicionCompra: "Minorista",

    totales: {
      subtotal: Number(body.subtotal ?? 0),
      costoEnvio: Number(body.shipping_cost ?? 0),
      totalFinal: Number(body.total ?? 0),
    },

    recargoDescuento: 0,
    detalleGeneral: `TN_ORDER_ID=${orderId}`,
    estado: "Pagado",

    items: expandedItems,
  };
}

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
  });

  clearTimeout(t);

  const text = await res.text().catch(() => "");
  let parsed: any = null;
  try {
    parsed = JSON.parse(text);
  } catch {}

  if (!res.ok || !parsed?.ok) {
    throw new Error(
      `ERP Apps Script error ${res.status}: ${(parsed?.error || text || "")
        .toString()
        .slice(0, 300)}`
    );
  }

  return parsed;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const orderId = body?.id;

    if (!orderId) return json({ ok: false, error: "Webhook sin body.id" }, 400);

    // Anti-duplicado: si ya existe, devolvemos ok para que TN no reintente
    const exists = await existsTNOrderInRemitos_(orderId);
    if (exists) return json({ ok: true, duplicated: true, orderId }, 200);

    const data = buildERPDataFromTNWebhook_(body);

    if (!Array.isArray(data.items) || data.items.length === 0) {
      return json({ ok: false, error: "Orden sin items válidos (sku/quantity)." }, 400);
    }

    const erpResp = await saveRemitoToERP_(data);

    return json({ ok: true, orderId, remitoId: erpResp?.id ?? null }, 200);
  } catch (e: any) {
    // Importante: si TN reintenta por errores 500, conviene devolver 200 cuando sea recuperable.
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
}
