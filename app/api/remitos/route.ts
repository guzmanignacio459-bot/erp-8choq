// app/api/remitos/route.ts
import { NextResponse } from "next/server";

const APPS = process.env.APPS_SCRIPT_URL;

export async function POST(req: Request) {
  try {
    const body = await req.json(); // { action, ... }
    if (!APPS) throw new Error("APPS_SCRIPT_URL no configurada");

    const res = await fetch(APPS, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const text = await res.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      data = { ok: false, error: text.slice(0, 300) };
    }

    if (!res.ok || data?.ok === false) {
      return NextResponse.json(
        { ok: false, error: data?.error || `Apps Script ${res.status}` },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}

// Azúcar para listar rápido /api/remitos?action=listRemitos
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action") || "listRemitos";
  return POST(
    new Request(req.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    })
  );
}
