import { readFileSync } from "node:fs";
import pg from "pg";
import { google } from "googleapis";

import { decidirFila } from "../lib/8q/pilar-escritura.ts";

const ENV = "/Applications/Shelby Company copy/Proyectos-8CHOQ/nextjs-boilerplate/.env.local";
const HOST = "ep-spring-frog-acago22x-pooler.sa-east-1.aws.neon.tech";

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

const aplicar = process.argv.includes("--aplicar");
const env = mapa(ENV);
const url = new URL((env.DATABASE_URL || "").replace(/^postgres(ql)?:/, "http:"));
if (url.hostname !== HOST || url.pathname.replace(/^\//, "") !== "neondb") {
  console.log("base no autorizada");
  process.exit(2);
}

const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 1 });
const antes = await pool.query("SELECT (SELECT count(*)::int FROM pilar_remitos) AS remitos, (SELECT count(*)::int FROM pilar_prendas) AS prendas, (SELECT max(sheet_row)::int FROM pilar_remitos) AS ultima");
const auth = new google.auth.JWT({
  email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: (env.GOOGLE_SERVICE_ACCOUNT_KEY || "").replace(/\\n/g, "\n"),
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
});
const sheets = google.sheets({ version: "v4", auth });
const abajo = await sheets.spreadsheets.values.get({
  spreadsheetId: env.GOOGLE_SHEETS_OPERATIONS_ID,
  range: `REMITOS!A${antes.rows[0].ultima + 1}:A`,
  valueRenderOption: "UNFORMATTED_VALUE",
});
const ids = (abajo.data.values || []).map((fila) => String(fila[0] ?? "").trim()).filter(Boolean);
console.log(`antes remitos=${antes.rows[0].remitos} prendas=${antes.rows[0].prendas} ultima=${antes.rows[0].ultima}`);
console.log(`filas_con_id_despues_de_la_ultima:${ids.length} aplicar:${aplicar}`);
const ejemplo = decidirFila({ id: "REMITOS:3631", completa: true, yaGuardada: true, hashNuevo: null, hashGuardado: null, vista: false });
console.log(`fila_ya_guardada:${ejemplo}`);

const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query("UPDATE pilar_remitos SET source_hash = source_hash WHERE false");
  await client.query("ROLLBACK");
} finally {
  client.release();
}
const despues = await pool.query("SELECT (SELECT count(*)::int FROM pilar_remitos) AS remitos, (SELECT count(*)::int FROM pilar_prendas) AS prendas");
const igual = despues.rows[0].remitos === antes.rows[0].remitos && despues.rows[0].prendas === antes.rows[0].prendas;
console.log(`rollback_conserva:${igual} despues remitos=${despues.rows[0].remitos} prendas=${despues.rows[0].prendas}`);
await pool.end();
if (!igual || ids.length > 0 || aplicar) process.exit(4);
