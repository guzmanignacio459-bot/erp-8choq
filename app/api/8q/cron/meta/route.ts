import { authorizeCron8q } from "@/lib/8q/meta-8q-cron";
import { correrTickMeta8q } from "@/lib/8q/meta-8q-tick";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  return Response.json({ ok: false, cron: "apagado" }, { status: 404 });
}

export async function POST(request: Request) {
  const decision = authorizeCron8q({
    authorization: request.headers.get("authorization"),
    mode: process.env.META_8Q_SYNC_MODE,
    secret: process.env.META_8Q_CRON_SECRET ?? "",
  });
  if (!decision.ok) {
    return Response.json({ ok: false, error: decision.error }, { status: decision.status });
  }
  const tick = await correrTickMeta8q(process.env);
  if (!tick.ok) {
    const status = tick.error === "ocupada" ? 409 : 503;
    return Response.json({ ok: false, error: tick.error }, { status });
  }
  return Response.json({ ok: true, since: tick.since, until: tick.until, filas: tick.filas });
}
