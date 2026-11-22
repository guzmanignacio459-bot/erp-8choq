import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import pg from "pg";

import { correrTickMeta8q } from "../lib/8q/meta-8q-tick.ts";
import { CUENTA_8Q } from "../lib/8q/meta-8q-cron.ts";
// Las extensiones .ts permiten correr el tick con node sin compilar.

const STAGING_HOST = "ep-spring-frog-acago22x-pooler.sa-east-1.aws.neon.tech";

function leerEnv(path: string): string {
  return readFileSync(path, "utf8");
}

function mapa(texto: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of texto.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const cut = trimmed.indexOf("=");
    let value = trimmed.slice(cut + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    env[trimmed.slice(0, cut)] = value;
  }
  return env;
}

function poner(texto: string, clave: string, valor: string): string {
  const linea = `${clave}=${valor}`;
  const re = new RegExp(`^${clave}=.*$`, "m");
  if (re.test(texto)) return texto.replace(re, linea);
  return `${texto.replace(/\s*$/, "")}\n${linea}\n`;
}

const ruta = ".env.local";
let texto = leerEnv(ruta);
let env = mapa(texto);
const presentes = ["META_8Q_APP_ID", "META_8Q_ACCESS_TOKEN", "META_8Q_AD_ACCOUNT_ID", "DATABASE_URL"].map((clave) => {
  const valor = env[clave] ?? "";
  return `${clave}:${valor ? "si" : "no"}:${valor.length}`;
});
console.log(presentes.join(" "));
console.log(`cuenta_oficial:${env.META_8Q_AD_ACCOUNT_ID === CUENTA_8Q}`);

if (!env.META_8Q_CRON_SECRET || env.META_8Q_CRON_SECRET.length < 20) {
  texto = poner(texto, "META_8Q_CRON_SECRET", randomBytes(32).toString("hex"));
}
if (!env.EIGHTQ_DASHBOARD_SECRET || env.EIGHTQ_DASHBOARD_SECRET.length < 20) {
  texto = poner(texto, "EIGHTQ_DASHBOARD_SECRET", randomBytes(32).toString("hex"));
}
writeFileSync(ruta, texto);
env = mapa(leerEnv(ruta));
console.log(`cron_secret:${env.META_8Q_CRON_SECRET.length >= 20} dashboard_secret:${env.EIGHTQ_DASHBOARD_SECRET.length >= 20}`);

const url = env.DATABASE_URL ?? "";
const parsed = new URL(url.replace(/^postgres(ql)?:/, "http:"));
if (parsed.hostname !== STAGING_HOST || parsed.pathname.replace(/^\//, "") !== "neondb") {
  console.log("base no autorizada");
  process.exit(2);
}

const pool = new pg.Pool({ connectionString: url, max: 1 });
const antes = await pool.query(
  `SELECT
     (SELECT count(*)::int FROM pilar_remitos) AS remitos,
     (SELECT count(*)::int FROM pilar_prendas) AS prendas,
     (SELECT count(*)::int FROM meta_8q_insight_daily) AS dias,
     (SELECT count(*)::int FROM (SELECT ad_account_id, day FROM meta_8q_insight_daily GROUP BY 1, 2 HAVING count(*) > 1) d) AS dias_duplicados,
     (SELECT last_day::text FROM meta_8q_sync_cursor WHERE ad_account_id = $1) AS cursor,
     (SELECT sum(spend)::text FROM meta_8q_insight_daily WHERE ad_account_id = $1) AS gasto`,
  [CUENTA_8Q]
);
const fila = antes.rows[0];
console.log(`antes remitos=${fila.remitos} prendas=${fila.prendas} dias=${fila.dias} duplicados=${fila.dias_duplicados} cursor=${fila.cursor} gasto=${fila.gasto}`);

const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query(
    `UPDATE meta_8q_insight_daily SET spend = spend + 1 WHERE ad_account_id = $1 AND day = $2::date`,
    [CUENTA_8Q, fila.cursor]
  );
  await client.query("ROLLBACK");
} finally {
  client.release();
}
const trasRollback = await pool.query(
  `SELECT sum(spend)::text AS gasto, (SELECT last_day::text FROM meta_8q_sync_cursor WHERE ad_account_id = $1) AS cursor
   FROM meta_8q_insight_daily WHERE ad_account_id = $1`,
  [CUENTA_8Q]
);
const igual = trasRollback.rows[0].gasto === fila.gasto && trasRollback.rows[0].cursor === fila.cursor;
console.log(`rollback_conserva_cursor:${igual}`);
if (!igual) process.exit(3);

const started = Date.now();
const tick = await correrTickMeta8q({ ...env, META_8Q_SYNC_MODE: "automatico" });
console.log(`tick_ms:${Date.now() - started} resultado:${tick.ok ? `ok ${tick.since} ${tick.until} filas=${tick.filas}` : tick.error}`);

const despues = await pool.query(
  `SELECT
     (SELECT count(*)::int FROM pilar_remitos) AS remitos,
     (SELECT count(*)::int FROM pilar_prendas) AS prendas,
     (SELECT count(*)::int FROM meta_8q_insight_daily WHERE ad_account_id = $1) AS dias,
     (SELECT count(*)::int FROM (SELECT ad_account_id, day FROM meta_8q_insight_daily GROUP BY 1, 2 HAVING count(*) > 1) d) AS dias_duplicados,
     (SELECT min(day)::text FROM meta_8q_insight_daily WHERE ad_account_id = $1) AS desde,
     (SELECT max(day)::text FROM meta_8q_insight_daily WHERE ad_account_id = $1) AS hasta,
     (SELECT last_day::text FROM meta_8q_sync_cursor WHERE ad_account_id = $1) AS cursor,
     (SELECT last_status FROM meta_8q_sync_cursor WHERE ad_account_id = $1) AS estado,
     (SELECT updated_at::text FROM meta_8q_sync_cursor WHERE ad_account_id = $1) AS leido,
     (SELECT sum(spend)::text FROM meta_8q_insight_daily WHERE ad_account_id = $1) AS gasto`,
  [CUENTA_8Q]
);
const fin = despues.rows[0];
console.log(`despues remitos=${fin.remitos} prendas=${fin.prendas} dias=${fin.dias} duplicados=${fin.dias_duplicados} desde=${fin.desde} hasta=${fin.hasta} cursor=${fin.cursor} estado=${fin.estado} leido=${fin.leido} gasto=${fin.gasto}`);
await pool.end();
if (!tick.ok || fin.remitos !== fila.remitos || fin.prendas !== fila.prendas || fin.dias_duplicados !== 0) process.exit(4);
