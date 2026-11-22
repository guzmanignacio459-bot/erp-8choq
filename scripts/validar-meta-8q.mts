/**
 * Primera consulta de Meta para 8CHOQ. No escribe y no imprime credenciales.
 * Uso: node --experimental-strip-types scripts/validar-meta-8q.mts
 */
import fs from "fs";
import path from "path";

import { validarMeta8q } from "../lib/8q/meta-8q.ts";

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
const resultado = await validarMeta8q(process.env);
if (resultado.estado === "sin_conectar") {
  console.log(JSON.stringify({ estado: "sin_conectar", faltan: resultado.faltan }));
} else if (resultado.estado === "rechazada") {
  console.log(JSON.stringify({ estado: "rechazada", motivo: resultado.motivo }));
} else {
  console.log(JSON.stringify({
    estado: "leida",
    dia: resultado.fila.dia,
    gasto: resultado.fila.gasto,
    compras: resultado.fila.compras,
    valorCompras: resultado.fila.valorCompras,
    impresiones: resultado.fila.impresiones,
    clics: resultado.fila.clics,
    cpa: resultado.fila.cpa,
    roas: resultado.fila.roas,
    moneda: resultado.fila.moneda,
  }));
}
