import { readFileSync } from "node:fs";
import pg from "pg";
import {
  diaCalendario,
  guardarMetricasMeta8q,
  leerRangoMeta8q,
  periodoMeta,
  planDeLectura,
  UPSERT_AUDITORIA,
  UPSERT_CURSOR,
} from "../lib/8q/meta-8q.ts";

const STAGING_HOST = "ep-spring-frog-acago22x-pooler.sa-east-1.aws.neon.tech";
const CUENTA = "act_10202653580793000";
const DESDE = "2026-10-01";
const VENCE = "2027-01-20";

function entorno(path: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const cut = trimmed.indexOf("=");
    if (cut < 1) continue;
    let value = trimmed.slice(cut + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    env[trimmed.slice(0, cut)] = value;
  }
  return env;
}

function baseAutorizada(url: string): boolean {
  try {
    const parsed = new URL(url.replace(/^postgres(ql)?:/, "http:"));
    return parsed.hostname === STAGING_HOST && parsed.pathname === "/neondb";
  } catch {
    return false;
  }
}

if (!process.argv.includes("--aplicar")) {
  console.log("falta --aplicar");
  process.exit(1);
}

const env = entorno(".env.local");
const url = env.DATABASE_URL ?? "";
if (!baseAutorizada(url)) {
  console.log("base no autorizada");
  process.exit(2);
}

const metaEnv = {
  META_8Q_APP_ID: env.META_8Q_APP_ID,
  META_8Q_APP_SECRET: env.META_8Q_APP_SECRET,
  META_8Q_ACCESS_TOKEN: env.META_8Q_ACCESS_TOKEN,
  META_8Q_AD_ACCOUNT_ID: env.META_8Q_AD_ACCOUNT_ID,
};
if (metaEnv.META_8Q_AD_ACCOUNT_ID !== CUENTA && metaEnv.META_8Q_AD_ACCOUNT_ID !== CUENTA.slice(4)) {
  console.log("cuenta distinta");
  process.exit(3);
}

const pool = new pg.Pool({ connectionString: url, max: 1 });

async function pilar(): Promise<string> {
  const result = await pool.query("SELECT (SELECT count(*) FROM pilar_remitos) AS remitos, (SELECT count(*) FROM pilar_prendas) AS prendas");
  const row = result.rows[0] as { remitos: string; prendas: string };
  return `${row.remitos} ${row.prendas}`;
}

const antes = await pilar();
const schema = readFileSync("lib/8q/meta-8q.sql", "utf8");
const sentencias = schema
  .split(";")
  .map((parte) => parte.replace(/--.*$/gm, "").trim())
  .filter(Boolean);
for (const sql of sentencias) {
  const plano = sql.replace(/\s+/g, " ");
  if (!plano.startsWith("CREATE TABLE IF NOT EXISTS meta_8q_")) {
    console.log("sql rechazado");
    process.exit(4);
  }
  await pool.query(sql);
}

const hoy = diaCalendario(new Date(), "America/Los_Angeles");
const cursorPrevio = await pool.query("SELECT last_day::text AS dia FROM meta_8q_sync_cursor WHERE ad_account_id = $1", [CUENTA]);
const ultimo = cursorPrevio.rows[0] ? String((cursorPrevio.rows[0] as { dia: string }).dia).slice(0, 10) : null;
const since = process.argv.includes("--historico") || !ultimo ? DESDE : planDeLectura(ultimo, hoy).since;
const diario = await leerRangoMeta8q({ env: metaEnv, since, until: hoy, nivel: "account" });
if (!diario.ok) {
  console.log("diario", diario.estado);
  process.exit(5);
}
const rango = await leerRangoMeta8q({ env: metaEnv, since, until: hoy, nivel: "account", resumen: true });
if (!rango.ok) {
  console.log("rango", rango.estado);
  process.exit(5);
}
const campanas = await leerRangoMeta8q({ env: metaEnv, since, until: hoy, nivel: "campaign" });
if (!campanas.ok) {
  console.log("campanas", campanas.estado);
  process.exit(5);
}

const client = await pool.connect();
try {
  await client.query("BEGIN");
  const guardado = await guardarMetricasMeta8q({
    confirmar: true,
    cuenta: CUENTA,
    filas: [...diario.filas, ...campanas.filas.filter((fila) => fila.gasto > 0)],
    zona: "America/Los_Angeles",
    hoy,
    ejecutar: (sql, params) => client.query(sql, params).then(() => undefined),
  });
  const total = periodoMeta(rango.filas);
  if (total) {
    await client.query(UPSERT_AUDITORIA, [CUENTA, since, hoy, total.gasto, total.compras, total.valorCompras, rango.filas[0]?.atribucion ?? null]);
  }
  await client.query(UPSERT_CURSOR, [CUENTA, hoy, VENCE]);
  await client.query("COMMIT");
  console.log(["guardado", guardado.filas, "desde", since, "hoy", hoy, "dias", diario.filas.length, "campanas", campanas.filas.length].join(" | "));
} catch (error) {
  await client.query("ROLLBACK");
  console.log(error instanceof Error ? error.message.slice(0, 80) : "escritura");
  process.exit(6);
} finally {
  client.release();
}

const control = await pool.query(
  `SELECT
     (SELECT count(*) FROM meta_8q_insight_daily) AS dias,
     (SELECT count(*) FROM meta_8q_campaign_daily) AS campanas,
     (SELECT count(*) FROM meta_8q_range_audit) AS auditorias,
     (SELECT count(*) FROM meta_8q_sync_cursor) AS cursores,
     (SELECT count(*) FROM (
        SELECT ad_account_id, day FROM meta_8q_insight_daily GROUP BY 1, 2 HAVING count(*) > 1
      ) d) AS dup_dias,
     (SELECT count(*) FROM (
        SELECT ad_account_id, campaign_id, day FROM meta_8q_campaign_daily GROUP BY 1, 2, 3 HAVING count(*) > 1
      ) c) AS dup_campanas,
     (SELECT min(day)::text FROM meta_8q_insight_daily) AS desde,
     (SELECT max(day)::text FROM meta_8q_insight_daily) AS hasta,
     (SELECT coalesce(sum(spend), 0)::text FROM meta_8q_insight_daily) AS gasto,
     (SELECT coalesce(sum(spend), 0)::text FROM meta_8q_insight_daily WHERE day < $1::date) AS cerrados,
     (SELECT coalesce(sum(spend), 0)::text FROM meta_8q_insight_daily WHERE partial) AS abierto,
     (SELECT spend::text FROM meta_8q_range_audit ORDER BY read_at DESC LIMIT 1) AS rango,
     (SELECT count(*) FROM generate_series($2::date, $1::date, '1 day') g
        LEFT JOIN meta_8q_insight_daily m ON m.day = g::date AND m.ad_account_id = $3
        WHERE m.day IS NULL) AS huecos`,
  [hoy, DESDE, CUENTA]
);
const fila = control.rows[0] as Record<string, string>;
console.log(["control", fila.dias, fila.campanas, fila.auditorias, fila.cursores, fila.dup_dias, fila.dup_campanas, fila.desde, fila.hasta, fila.gasto, fila.cerrados, fila.abierto, fila.rango, fila.huecos].join(" | "));
const despues = await pilar();
console.log(["pilar", antes, despues].join(" | "));
await pool.end();
