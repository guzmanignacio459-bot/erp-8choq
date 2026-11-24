import { authorizePilar8q, escrituraPilarHabilitada } from "@/lib/8q/pilar-cron";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  return Response.json({ ok: false, cron: "apagado" }, { status: 404 });
}

export async function POST(request: Request) {
  const decision = authorizePilar8q({
    authorization: request.headers.get("authorization"),
    mode: process.env.PILAR_8Q_SYNC_MODE,
    secret: process.env.PILAR_8Q_CRON_SECRET ?? "",
  });
  if (!decision.ok) {
    return Response.json({ ok: false, error: decision.error }, { status: decision.status });
  }
  if (!escrituraPilarHabilitada()) {
    return Response.json({ ok: false, error: "escritura_no_validada" }, { status: 409 });
  }
  return Response.json({ ok: true, filas: 0 });
}
