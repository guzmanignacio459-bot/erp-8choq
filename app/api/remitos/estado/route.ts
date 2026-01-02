// app/api/remitos/estado/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const GS_URL = (process.env.NEXT_PUBLIC_GS_URL ?? process.env.APPS_SCRIPT_URL ?? "").trim();
const TOKEN  = (process.env.APPS_SCRIPT_TOKEN ?? "").trim();

function json(body: any, status = 200) {
  return new NextResponse(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(req: Request) {
  try {
    const { id, estado } = await req.json().catch(() => ({} as any));
    if (!id || !estado) {
      return json({ ok: false, error: "id y estado son requeridos" }, 400);
    }
    if (!GS_URL) {
      return json({ ok: false, error: "GS_URL/APPS_SCRIPT_URL no configurada" }, 500);
    }
    try {
      new URL(GS_URL);
    } catch {
      return json({ ok: false, error: "APPS_SCRIPT_URL inválida" }, 500);
    }

    // Timeout defensivo (12s)
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 12_000);

    const resp = await fetch(GS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: controller.signal,
      body: JSON.stringify({ action: "setEstado", id, estado, token: TOKEN }),
    }).catch((e) => {
      throw new Error(`Fetch Apps Script falló: ${e?.message || e}`);
    });

    clearTimeout(t);

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return json(
        { ok: false, error: `Apps Script ${resp.status}: ${text?.slice(0, 200)}` },
        502
      );
    }

    const payload = await resp.json().catch(() => null);
    if (!payload || !payload.ok) {
      return json(
        { ok: false, error: String(payload?.error || "Respuesta inválida de Apps Script") },
        502
      );
    }

    return json({ ok: true, id, estado }, 200);
  } catch (err: any) {
    const msg = err?.name === "AbortError" ? "Timeout consultando Apps Script" : String(err?.message || err);
    return json({ ok: false, error: msg }, 500);
  }
}
