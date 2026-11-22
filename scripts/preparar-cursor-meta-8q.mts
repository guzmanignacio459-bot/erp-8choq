import { readFileSync } from "node:fs";
import pg from "pg";

const STAGING_HOST = "ep-spring-frog-acago22x-pooler.sa-east-1.aws.neon.tech";

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

const env = entorno(".env.local");
const url = env.DATABASE_URL ?? "";
let host = "";
let database = "";
try {
  const parsed = new URL(url.replace(/^postgres(ql)?:/, "http:"));
  host = parsed.hostname;
  database = parsed.pathname.replace(/^\//, "");
} catch {
  host = "";
}
if (host !== STAGING_HOST || database !== "neondb") {
  console.log("base no autorizada");
  process.exit(2);
}

const pool = new pg.Pool({ connectionString: url, max: 1 });
await pool.query(`ALTER TABLE meta_8q_sync_cursor
  ADD COLUMN IF NOT EXISTS lock_until timestamptz,
  ADD COLUMN IF NOT EXISTS last_status text,
  ADD COLUMN IF NOT EXISTS last_error text`);
const columnas = await pool.query(
  `SELECT column_name FROM information_schema.columns
   WHERE table_name = 'meta_8q_sync_cursor' ORDER BY ordinal_position`
);
const pilar = await pool.query(
  `SELECT id, status, read_at::text AS read_at
   FROM pilar_import_runs ORDER BY read_at DESC LIMIT 1`
);
console.log(columnas.rows.map((row) => row.column_name).join(" "));
const ultima = pilar.rows[0] as { id?: string; status?: string; read_at?: string } | undefined;
console.log(ultima ? `${ultima.id} ${ultima.status} ${ultima.read_at}` : "sin corrida");
await pool.end();
