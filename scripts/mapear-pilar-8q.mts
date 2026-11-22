import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { google } from "googleapis";

const ENV = "/Applications/Shelby Company copy/Proyectos-8CHOQ/nextjs-boilerplate/.env.local";

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

function texto(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "number") return String(value);
  return String(value).trim();
}

function numero(value: unknown): string {
  if (value == null || value === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return n.toFixed(2);
}

const env = mapa(ENV);
const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 1 });
const forma = await pool.query(`
  SELECT
    count(*) FILTER (WHERE id LIKE 'REMITOS:%')::int AS remitos_id,
    count(*) FILTER (WHERE id NOT LIKE 'REMITOS:%')::int AS remitos_otro,
    min(length(source_hash))::int AS hash_min,
    max(length(source_hash))::int AS hash_max
  FROM pilar_remitos
`);
const prendaForma = await pool.query(`
  SELECT
    count(*) FILTER (WHERE id LIKE 'REMITO_ITEMS:%')::int AS items_id,
    count(*) FILTER (WHERE id NOT LIKE 'REMITO_ITEMS:%')::int AS items_otro
  FROM pilar_prendas
`);
const muestras = await pool.query(`
  SELECT id, sheet_name, sheet_row, id_remito, fecha_venta::text AS fecha,
         total_final::text AS total_final, subtotal::text AS subtotal,
         shipping_customer_cost::text AS envio_cliente,
         shipping_owner_cost::text AS envio_ocho,
         tn_order_id, source_hash, metodo_pago
  FROM pilar_remitos
  WHERE sheet_row IN (
    (SELECT min(sheet_row) FROM pilar_remitos),
    (SELECT max(sheet_row) FROM pilar_remitos)
  )
  ORDER BY sheet_row
`);
console.log(JSON.stringify({ remitos: forma.rows[0], prendas: prendaForma.rows[0] }));

const auth = new google.auth.JWT({
  email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: (env.GOOGLE_SERVICE_ACCOUNT_KEY || "").replace(/\\n/g, "\n"),
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
});
const sheets = google.sheets({ version: "v4", auth });
const libro = env.GOOGLE_SHEETS_OPERATIONS_ID;
const encabezado = await sheets.spreadsheets.values.get({
  spreadsheetId: libro,
  range: "REMITOS!1:1",
  valueRenderOption: "UNFORMATTED_VALUE",
});
const headers = (encabezado.data.values?.[0] || []).map((item) => texto(item));
console.log(`encabezados_remitos:${headers.length}`);
console.log(headers.map((item, index) => `${index}:${item}`).join(" | "));

function candidatos(header: string, celda: string, fila: Record<string, string>): string[] {
  const crudo = texto(celda);
  const num = numero(celda);
  return Object.entries(fila).flatMap(([campo, valor]) => {
    if (!valor) return [];
    if (crudo === valor || (num && num === numero(valor))) return [`${header}->${campo}`];
    return [];
  });
}

for (const row of muestras.rows) {
  const leida = await sheets.spreadsheets.values.get({
    spreadsheetId: libro,
    range: `REMITOS!A${row.sheet_row}:ZZ${row.sheet_row}`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const celdas = leida.data.values?.[0] || [];
  const plano: Record<string, string> = {
    id_remito: texto(row.id_remito),
    fecha: texto(row.fecha).slice(0, 10),
    total_final: numero(row.total_final),
    subtotal: numero(row.subtotal),
    envio_cliente: numero(row.envio_cliente),
    envio_ocho: numero(row.envio_ocho),
    tn_order_id: texto(row.tn_order_id),
    metodo_pago: texto(row.metodo_pago),
  };
  const pares = headers.flatMap((header, index) => candidatos(header, texto(celdas[index]), plano));
  const unido = celdas.map((item) => texto(item)).join("|");
  const hashes = {
    sha256_join: createHash("sha256").update(unido).digest("hex"),
    sha1_join: createHash("sha1").update(unido).digest("hex"),
    md5_join: createHash("md5").update(unido).digest("hex"),
  };
  const hashGuardado = texto(row.source_hash);
  const coincide = Object.entries(hashes).filter(([, valor]) => valor === hashGuardado).map(([nombre]) => nombre);
  console.log(`fila:${row.sheet_row} id_es_hoja:${row.id === `REMITOS:${row.sheet_row}`} pares:${pares.join(",") || "ninguno"} hash:${coincide.join(",") || "no"}`);
}

const prenda = await pool.query(`
  SELECT id, sheet_name, sheet_row, id_remito, sku, articulo, talle, cantidad::text AS cantidad,
         precio_unitario::text AS precio, owner, neto_prenda::text AS neto, source_hash
  FROM pilar_prendas
  WHERE sheet_row = (SELECT max(sheet_row) FROM pilar_prendas)
  LIMIT 1
`);
const itemHeaders = await sheets.spreadsheets.values.get({
  spreadsheetId: libro,
  range: "REMITO_ITEMS!1:1",
  valueRenderOption: "UNFORMATTED_VALUE",
});
const headersItem = (itemHeaders.data.values?.[0] || []).map((item) => texto(item));
console.log(`encabezados_items:${headersItem.length}`);
console.log(headersItem.map((item, index) => `${index}:${item}`).join(" | "));
const una = prenda.rows[0];
if (una) {
  const leida = await sheets.spreadsheets.values.get({
    spreadsheetId: libro,
    range: `REMITO_ITEMS!A${una.sheet_row}:ZZ${una.sheet_row}`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const celdas = leida.data.values?.[0] || [];
  const plano: Record<string, string> = {
    id_remito: texto(una.id_remito),
    sku: texto(una.sku),
    articulo: texto(una.articulo),
    talle: texto(una.talle),
    cantidad: numero(una.cantidad),
    precio: numero(una.precio),
    owner: texto(una.owner),
    neto: numero(una.neto),
  };
  const pares = headersItem.flatMap((header, index) => candidatos(header, texto(celdas[index]), plano));
  console.log(`prenda_fila:${una.sheet_row} id_es_hoja:${una.id === `REMITO_ITEMS:${una.sheet_row}`} pares:${pares.join(",") || "ninguno"}`);
}
const MAPA_REMITO: Record<string, string> = {
  "ID Remito": "id_remito",
  "Fecha": "fecha_venta",
  "Metodo De Pago": "metodo_pago",
  "Total De Prendas": "total_prendas",
  "Subtotal": "subtotal",
  "Shipping Customer Cost": "shipping_customer_cost",
  "Envio Owner": "envio_owner",
  "Shipping Owner Cost": "shipping_owner_cost",
  "Recargo/Descuento": "recargo_descuento",
  "Total Final": "total_final",
  "Estado": "estado",
  "Dueño SCNL Cant": "scnl_cant",
  "Dueño SCNL Monto": "scnl_monto",
  "TN_ORDER_ID": "tn_order_id",
  "MP_PAYMENT_ID": "mp_payment_id",
  "MP_STATUS": "mp_status",
  "MP_DATE_APPROVED": "mp_date_approved",
  "MP_MONEY_RELEASE_DATE": "mp_money_release_date",
  "MP_ACREDITADO_FECHA": "mp_acreditado_fecha",
  "MP_TRANSACTION_AMOUNT": "mp_transaction_amount",
  "MP_NET_RECEIVED_AMOUNT": "mp_net_received_amount",
  "MP_TAX_TOTAL_REAL": "mp_tax_total_real",
  "MP_FINANCING_TOTAL_REAL": "mp_financing_total_real",
  "MP_FEE_TOTAL_REAL": "mp_fee_total_real",
  "MP_PLATFORM_FEE_TOTAL_REAL": "mp_platform_fee_total_real",
  "MP_PAYMENT_TYPE": "mp_payment_type",
  "MP_PAYMENT_METHOD": "mp_payment_method",
  "MP_INSTALLMENTS": "mp_installments",
  "MP_TOTAL_COST_REAL": "mp_total_cost_real",
  "MP_NETO_REAL_ORDEN": "mp_neto_real_orden",
  "MP_COST_PERCENT_REAL": "mp_cost_percent_real",
  "Costo De Envio": "costo_envio",
  "Costo Envio Owner": "costo_envio_owner",
};

function igual(celda: unknown, guardado: unknown): boolean {
  if (celda == null || celda === "") return guardado == null || guardado === "";
  if (typeof celda === "number" && typeof guardado === "string") {
    const n = Number(guardado);
    return Number.isFinite(n) && Math.abs(celda - n) < 0.001;
  }
  return texto(celda) === texto(guardado);
}

for (const row of muestras.rows) {
  const completo = await pool.query("SELECT * FROM pilar_remitos WHERE id = $1", [row.id]);
  const guardado = completo.rows[0] as Record<string, unknown>;
  const leida = await sheets.spreadsheets.values.get({
    spreadsheetId: libro,
    range: `REMITOS!A${row.sheet_row}:ZZ${row.sheet_row}`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const celdas = leida.data.values?.[0] || [];
  const fallos: string[] = [];
  for (const [header, campo] of Object.entries(MAPA_REMITO)) {
    const index = headers.indexOf(header);
    if (index < 0) {
      fallos.push(`${campo}:sin_encabezado`);
      continue;
    }
    if (!igual(celdas[index], guardado[campo])) fallos.push(campo);
  }
  const fechaIndex = headers.indexOf("Fecha");
  const serial = Number(celdas[fechaIndex]);
  const iso = texto(row.fecha).slice(0, 10);
  const [anio, mes, dia] = iso.split("-").map(Number);
  const esperado = (Date.UTC(anio, mes - 1, dia) - Date.UTC(1899, 11, 30)) / 86400000;
  const delta = Number.isFinite(serial) ? Math.floor(serial) - esperado : null;
  const tn = texto(guardado.tn_order_id);
  const donde = headers.flatMap((header, index) => {
    const celda = celdas[index];
    const comoTexto = typeof celda === "number" ? String(Math.round(celda)) : texto(celda);
    return tn && comoTexto === tn ? [header] : [];
  });
  console.log(`verificacion:${row.sheet_row} fallos:${fallos.filter((item) => item !== "fecha_venta" && item !== "tn_order_id").join(",") || "ninguno"} delta_fecha:${delta} tn_en:${donde.join(",") || (tn ? "ausente" : "vacio")}`);
}
await pool.end();
