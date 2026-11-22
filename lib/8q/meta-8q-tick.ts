import pg from "pg";

import {
  diaCalendario,
  guardarMetricasMeta8q,
  leerRangoMeta8q,
  periodoMeta,
  UPSERT_AUDITORIA,
  UPSERT_CURSOR,
} from "./meta-8q.ts";
import { CUENTA_8Q, ventanaAutomatica } from "./meta-8q-cron.ts";

const STAGING_HOST = "ep-spring-frog-acago22x-pooler.sa-east-1.aws.neon.tech";
const ZONA = "America/Los_Angeles";

export type TickMeta =
  | { ok: true; since: string; until: string; filas: number }
  | { ok: false; error: "base" | "sin_cursor" | "ocupada" | "lectura" | "vacio" };

function baseAutorizada(url: string): boolean {
  try {
    const parsed = new URL(url.replace(/^postgres(ql)?:/, "http:"));
    return parsed.hostname === STAGING_HOST && parsed.pathname.replace(/^\//, "") === "neondb";
  } catch {
    return false;
  }
}

export async function correrTickMeta8q(env: Record<string, string | undefined>): Promise<TickMeta> {
  const url = (env.DATABASE_URL ?? "").trim();
  if (!baseAutorizada(url)) return { ok: false, error: "base" };
  const cuenta = env.META_8Q_AD_ACCOUNT_ID === CUENTA_8Q || env.META_8Q_AD_ACCOUNT_ID === CUENTA_8Q.slice(4)
    ? CUENTA_8Q
    : "";
  if (!cuenta) return { ok: false, error: "base" };

  const pool = new pg.Pool({ connectionString: url, max: 1 });
  const client = await pool.connect();
  let bloqueada = false;
  try {
    const locked = await client.query<{ last_day: string | null; token_expires_on: string | null }>(
      `UPDATE meta_8q_sync_cursor
       SET lock_until = now() + interval '2 minutes', last_status = 'corriendo', last_error = NULL
       WHERE ad_account_id = $1
         AND (lock_until IS NULL OR lock_until < now())
       RETURNING last_day::text, token_expires_on::text`,
      [cuenta]
    );
    if (locked.rowCount !== 1) {
      const existe = await client.query("SELECT 1 FROM meta_8q_sync_cursor WHERE ad_account_id = $1", [cuenta]);
      return { ok: false, error: existe.rowCount === 1 ? "ocupada" : "sin_cursor" };
    }
    bloqueada = true;
    const ultimo = (locked.rows[0].last_day ?? "").slice(0, 10);
    const vence = (locked.rows[0].token_expires_on ?? "").slice(0, 10) || null;
    const hoy = diaCalendario(new Date(), ZONA);
    const ventana = ventanaAutomatica(ultimo || null, hoy);
    if (!ventana) return { ok: false, error: "sin_cursor" };

    const metaEnv = {
      META_8Q_APP_ID: env.META_8Q_APP_ID,
      META_8Q_APP_SECRET: env.META_8Q_APP_SECRET,
      META_8Q_ACCESS_TOKEN: env.META_8Q_ACCESS_TOKEN,
      META_8Q_AD_ACCOUNT_ID: cuenta,
    };
    const diarias = await leerRangoMeta8q({ env: metaEnv, since: ventana.since, until: ventana.until, nivel: "account" });
    const resumen = await leerRangoMeta8q({ env: metaEnv, since: ventana.since, until: ventana.until, nivel: "account", resumen: true });
    const campanas = await leerRangoMeta8q({ env: metaEnv, since: ventana.since, until: ventana.until, nivel: "campaign" });
    if (!diarias.ok || !resumen.ok || !campanas.ok) return { ok: false, error: "lectura" };
    const totales = periodoMeta(diarias.filas);
    const rango = periodoMeta(resumen.filas);
    if (!totales || !rango) return { ok: false, error: "vacio" };

    await client.query("BEGIN");
    const guardado = await guardarMetricasMeta8q({
      confirmar: true,
      cuenta,
      filas: [...diarias.filas, ...campanas.filas.filter((fila) => fila.gasto > 0)],
      zona: ZONA,
      hoy,
      ejecutar: async (sql, params) => {
        await client.query(sql, params);
      },
    });
    await client.query(UPSERT_AUDITORIA, [cuenta, ventana.since, ventana.until, rango.gasto, rango.compras, rango.valorCompras, "multiple"]);
    await client.query(UPSERT_CURSOR, [cuenta, ventana.until, vence]);
    await client.query(
      `UPDATE meta_8q_sync_cursor
       SET lock_until = NULL, last_status = 'ok', last_error = NULL
       WHERE ad_account_id = $1`,
      [cuenta]
    );
    await client.query("COMMIT");
    bloqueada = false;
    return { ok: true, since: ventana.since, until: ventana.until, filas: guardado.filas };
  } catch {
    await client.query("ROLLBACK").catch(() => undefined);
    return { ok: false, error: "lectura" };
  } finally {
    if (bloqueada) {
      await client.query(
        `UPDATE meta_8q_sync_cursor
         SET lock_until = NULL, last_status = 'error', last_error = 'lectura'
         WHERE ad_account_id = $1`,
        [cuenta]
      ).catch(() => undefined);
    }
    client.release();
    await pool.end();
  }
}
