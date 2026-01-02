// app/api/remitos/list/route.ts
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic"; // evita cache en build
export const revalidate = 0;

const GS_URL = (
  process.env.NEXT_PUBLIC_GS_URL ?? process.env.APPS_SCRIPT_URL ?? ""
).trim();

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

export async function GET(req: NextRequest) {
  // 1) Validaciones de configuración
  if (!GS_URL) {
    return json(
      {
        ok: false,
        data: [],
        error:
          "Falta configurar NEXT_PUBLIC_GS_URL o APPS_SCRIPT_URL en las variables de entorno.",
      },
      500
    );
  }

  try {
    // Valida formato de URL temprano
    new URL(GS_URL);
  } catch {
    return json(
      { ok: false, data: [], error: "La URL de Apps Script (GS_URL) es inválida." },
      500
    );
  }

  try {
    // 2) Tomamos un posible ?q=... para filtros server-side
    const url = new URL(req.url);
    const q = url.searchParams.get("q") || "";

    // 3) Timeout defensivo
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12_000);

    const res = await fetch(GS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: controller.signal,
      body: JSON.stringify({
        action: "listRemitos",
        q,
        token: TOKEN,
      }),
    }).catch((e) => {
      throw new Error(`Fetch a Apps Script falló: ${e?.message || String(e)}`);
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return json(
        {
          ok: false,
          data: [],
          error: `Apps Script respondió ${res.status}: ${text.slice(0, 200)}`,
        },
        502
      );
    }

    // 4) Intentamos parsear JSON. Si viene HTML o algo raro, va al catch.
    const payload = await res.json();

    // Si Apps Script ya devuelve { ok: true, data: [...] } lo reenviamos así.
    if (payload && payload.ok) {
      return json(payload, 200);
    }

    return json(
      {
        ok: false,
        data: [],
        error: String(payload?.error || "Respuesta inválida desde Apps Script."),
      },
      502
    );
  } catch (err: any) {
    const msg =
      err?.name === "AbortError"
        ? "Timeout consultando Apps Script."
        : String(err?.message || err);

    return json({ ok: false, data: [], error: msg }, 500);
  }
}
