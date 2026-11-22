import { readFileSync } from "node:fs";
import pg from "pg";

function mapa(path: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const cut = trimmed.indexOf("=");
    let value = trimmed.slice(cut + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    env[trimmed.slice(0, cut)] = value;
  }
  return env;
}

const env = mapa(".env.local");
const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 1 });
const panel = await pool.query(`
  SELECT coalesce(sum(p.precio_unitario * p.cantidad), 0)::text AS bruto,
         coalesce(sum(p.neto_prenda_real), 0)::text AS real,
         coalesce(sum(p.mp_total_cost_asignado_real), 0)::text AS mp,
         coalesce(sum(p.shipping_asignado), 0)::text AS envio_asignado,
         count(DISTINCT r.id_remito)::int AS remitos,
         count(*)::int AS prendas
  FROM pilar_prendas p
  JOIN pilar_remitos r ON r.id_remito = p.id_remito AND r.duplicado = false
  WHERE r.fecha_venta >= '2026-10-01' AND r.fecha_venta <= '2026-11-30'
`);
const envio = await pool.query(`
  SELECT coalesce(sum(shipping_owner_cost), 0)::text AS ocho,
         coalesce(sum(shipping_customer_cost), 0)::text AS cliente,
         count(*)::int AS remitos
  FROM pilar_remitos
  WHERE duplicado = false AND fecha_venta >= '2026-10-01' AND fecha_venta <= '2026-11-30'
`);
const meta = await pool.query(`
  SELECT coalesce(sum(spend), 0)::text AS gasto,
         coalesce(sum(purchases), 0)::text AS compras,
         coalesce(sum(purchase_value), 0)::text AS valor,
         min(day)::text AS desde,
         max(day)::text AS hasta,
         count(*)::int AS dias
  FROM meta_8q_insight_daily
  WHERE ad_account_id = 'act_10202653580793000'
    AND day >= '2026-10-01' AND day <= '2026-11-30'
`);
const abiertos = await pool.query(`
  SELECT day::text AS dia, spend::text AS gasto, partial
  FROM meta_8q_insight_daily
  WHERE ad_account_id = 'act_10202653580793000' AND day >= '2026-11-20'
  ORDER BY day
`);
const cobertura = await pool.query(`
  SELECT (SELECT min(fecha_venta)::text FROM pilar_remitos WHERE duplicado = false) AS pilar_desde,
         (SELECT max(fecha_venta)::text FROM pilar_remitos WHERE duplicado = false) AS pilar_hasta,
         (SELECT max(sheet_row)::int FROM pilar_remitos) AS ultima_fila,
         (SELECT count(*)::int FROM pilar_remitos) AS remitos,
         (SELECT count(*)::int FROM pilar_prendas) AS prendas
`);
const real = Number(panel.rows[0].real);
const logistica = Number(envio.rows[0].ocho);
const gasto = Number(meta.rows[0].gasto);
const valor = Number(meta.rows[0].valor);
const compras = Number(meta.rows[0].compras);
console.log(JSON.stringify({
  panel: panel.rows[0],
  envio: envio.rows[0],
  meta: meta.rows[0],
  dias: abiertos.rows,
  cobertura: cobertura.rows[0],
  neto_parcial: Math.round((real - logistica - gasto) * 100) / 100,
  roas_atribuido: compras ? Math.round((valor / gasto) * 100) / 100 : null,
  roas_financiero: gasto ? Math.round((real / gasto) * 100) / 100 : null,
  cpa: compras ? Math.round((gasto / compras) * 100) / 100 : null,
}, null, 2));
await pool.end();
