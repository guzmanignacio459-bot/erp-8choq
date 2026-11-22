import { readFileSync } from "node:fs";
import pg from "pg";
import { google } from "googleapis";

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
const email = env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "";
const key = (env.GOOGLE_SERVICE_ACCOUNT_KEY || "").replace(/\\n/g, "\n");
const spreadsheetId = env.GOOGLE_SHEETS_OPERATIONS_ID || "";
if (!email || !key || !spreadsheetId) {
  console.log("fuente_sheets:no");
  process.exit(0);
}

const auth = new google.auth.JWT({
  email,
  key,
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
});
const sheets = google.sheets({ version: "v4", auth });
const encabezado = await sheets.spreadsheets.values.get({
  spreadsheetId,
  range: "REMITOS!1:1",
  valueRenderOption: "UNFORMATTED_VALUE",
});
const headers = (encabezado.data.values?.[0] || []).map((item) => String(item).trim());
const idCol = headers.indexOf("ID Remito");
if (idCol < 0) {
  console.log("columna_id:no");
  process.exit(0);
}
const letra = ((n: number) => {
  let out = "";
  let x = n + 1;
  while (x > 0) {
    const resto = (x - 1) % 26;
    out = String.fromCharCode(65 + resto) + out;
    x = Math.floor((x - 1) / 26);
  }
  return out;
})(idCol);
const abajo = await sheets.spreadsheets.values.get({
  spreadsheetId,
  range: `REMITOS!${letra}3632:${letra}`,
  valueRenderOption: "UNFORMATTED_VALUE",
});
const ids = (abajo.data.values || []).map((fila) => String(fila[0] ?? "").trim()).filter(Boolean);
const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 1 });
const conocidos = new Set(
  (await pool.query("SELECT id_remito FROM pilar_remitos")).rows.map((row) => String(row.id_remito))
);
const nuevos = ids.filter((id) => !conocidos.has(id));
console.log(`filas_despues_de_3631:${ids.length} ids_ausentes_en_neon:${nuevos.length}`);
await pool.end();
