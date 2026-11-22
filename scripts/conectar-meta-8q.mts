/**
 * Lista las cuentas de la aplicación de 8CHOQ. No imprime el token y no escribe en Neon.
 * Uso: node --experimental-strip-types scripts/conectar-meta-8q.mts
 */
import fs from "fs";
import path from "path";

import { elegirCuenta8q, listarCuentasMeta8q, periodoMeta, leerRangoMeta8q } from "../lib/8q/meta-8q.ts";

function cargarEnvLocal() {
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index);
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!process.env[key]) process.env[key] = value;
  }
}

cargarEnvLocal();
const lista = await listarCuentasMeta8q(process.env);
if (lista.estado !== "cuentas") {
  console.log(JSON.stringify(lista));
  process.exit(0);
}

const eleccion = elegirCuenta8q(lista.cuentas);
const resumen = {
  estado: lista.estado,
  permisos: lista.permisos,
  cuentas: lista.cuentas,
  eleccion: eleccion.estado,
};
if (eleccion.estado !== "unica") {
  console.log(JSON.stringify(resumen));
  process.exit(0);
}

const lectura = await leerRangoMeta8q({
  env: { ...process.env, META_8Q_AD_ACCOUNT_ID: eleccion.id },
  since: "2026-10-01",
  until: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()),
  nivel: "account",
});
if (!lectura.ok) {
  console.log(JSON.stringify({ ...resumen, lectura: lectura.estado, motivo: lectura.motivo }));
  process.exit(0);
}
console.log(JSON.stringify({ ...resumen, periodo: periodoMeta(lectura.filas), dias: lectura.filas.length }));
