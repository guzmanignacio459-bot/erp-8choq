const EXPRESION = "*/15 * * * *";

export default {
  async fetch() {
    return Response.json({ cron: "apagado", expresion: EXPRESION });
  },
  async scheduled(_event: unknown, env: { OCHOQ_URL?: string; OCHOQ_CRON_SECRET?: string }) {
    if (!env.OCHOQ_URL || !env.OCHOQ_CRON_SECRET) return;
    await fetch(new URL("/api/8q/cron/meta", env.OCHOQ_URL), {
      method: "POST",
      headers: { authorization: `Bearer ${env.OCHOQ_CRON_SECRET}` },
    });
  },
};
