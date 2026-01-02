// app/api/remitos/save/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const GS_URL =
  (process.env.NEXT_PUBLIC_GS_URL ??
    process.env.NEXT_PUBLIC_REMITOS_WEBHOOK_URL ??
    process.env.APPS_SCRIPT_URL ??
    "").trim();
const TOKEN = (process.env.APPS_SCRIPT_TOKEN ?? "").trim();

function json(body: any, status = 200) {
  return new NextResponse(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Proxy hacia Google Apps Script (acción: saveRemito)
 * Espera body con estructura:
 * {
 *   data: {
 *     fechaISO, nombre, dni, localidad, telefono,
 *     transporte, metodoPago, vendedor, condicionCompra, estado,
 *     recargoDescuento, detalleGeneral, envio,
 *     items: [{ sku, articulo, talle, cantidad, precioUnitario }]
 *   }
 * }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return json({ ok: false, error: "Body vacío o inválido" }, 400);

    const data = body?.data ? body.data : body;
    if (!data || typeof data !== "object") {
      return json({ ok: false, error: "Falta objeto 'data' válido" }, 400);
    }

    if (!GS_URL)
      return json({ ok: false, error: "Falta configurar GS_URL/APPS_SCRIPT_URL" }, 500);

    try {
      new URL(GS_URL);
    } catch {
      return json({ ok: false, error: "APPS_SCRIPT_URL inválida" }, 500);
    }

    // Timeout de seguridad (12 segundos)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);

    const payload = {
      action: "saveRemito",
      token: TOKEN,
      data,
    };

    const resp = await fetch(GS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: controller.signal,
      body: JSON.stringify(payload),
    }).catch((e) => {
      throw new Error(`Error al enviar a Apps Script: ${e?.message || e}`);
    });

    clearTimeout(timeout);

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return json(
        { ok: false, error: `Apps Script ${resp.status}: ${text?.slice(0, 200)}` },
        502
      );
    }

    const result = await resp.json().catch(() => null);
    if (!result || !result.ok) {
      return json(
        { ok: false, error: String(result?.error || "Respuesta inválida de Apps Script") },
        502
      );
    }

    return json(
      {
        ok: true,
        id: result.id ?? null,
        message: result.message ?? "Remito guardado correctamente",
      },
      200
    );
  } catch (err: any) {
    const msg =
      err?.name === "AbortError"
        ? "Timeout consultando Apps Script"
        : String(err?.message || err);
    return json({ ok: false, error: msg }, 500);
  }
}
