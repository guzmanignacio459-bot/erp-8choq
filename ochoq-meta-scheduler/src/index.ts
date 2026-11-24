const EXPRESION = "*/15 * * * *";

export default {
  async fetch() {
    return Response.json({ cron: "programado", expresion: EXPRESION });
  },
  async scheduled(_event: unknown, env: { OCHOQ_URL?: string; OCHOQ_CRON_SECRET?: string }) {
    if (!env.OCHOQ_URL || !env.OCHOQ_CRON_SECRET) return;
    const respuesta = await fetch(new URL("/api/8q/cron/meta", env.OCHOQ_URL), {
      method: "POST",
      headers: { authorization: `Bearer ${env.OCHOQ_CRON_SECRET}` },
    });
    const cuerpo = await respuesta.json().catch(() => ({}));
    console.log(JSON.stringify({
      status: respuesta.status,
      ok: cuerpo.ok === true,
      error: typeof cuerpo.error === "string" ? cuerpo.error : null,
      since: typeof cuerpo.since === "string" ? cuerpo.since : null,
      until: typeof cuerpo.until === "string" ? cuerpo.until : null,
      filas: Number.isFinite(cuerpo.filas) ? cuerpo.filas : null,
    }));
  },
};
