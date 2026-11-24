const EXPRESION = "*/15 * * * *";

export default {
  async fetch() {
    return Response.json({ cron: "apagado", expresion: EXPRESION });
  },
  async scheduled(_event: unknown, env: { OCHOQ_URL?: string; PILAR_CRON_SECRET?: string }) {
    if (!env.OCHOQ_URL || !env.PILAR_CRON_SECRET) return;
    const respuesta = await fetch(new URL("/api/8q/cron/pilar", env.OCHOQ_URL), {
      method: "POST",
      headers: { authorization: `Bearer ${env.PILAR_CRON_SECRET}` },
    });
    const cuerpo = await respuesta.json().catch(() => ({}));
    console.log(JSON.stringify({
      status: respuesta.status,
      ok: cuerpo.ok === true,
      error: typeof cuerpo.error === "string" ? cuerpo.error : null,
      filas: Number.isFinite(cuerpo.filas) ? cuerpo.filas : null,
    }));
  },
};
