#!/usr/bin/env node
/**
 * FASE E.2 — dryRun GIFTY contra import-orders local (post-build).
 * Uso: node scripts/fase-e2-gifty-dryrun.mjs [baseUrl]
 */

import fs from "fs";
import path from "path";

const BASE = process.argv[2] || "http://localhost:3000";
const ORDERS = ["1981026616", "1980843190"];
const FROM = "2026-05-27T00:00:00.000Z";
const TO = "2026-05-31T23:59:59.999Z";

function loadEnv() {
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

loadEnv();

const token =
  process.env.TIENDANUBE_IMPORT_TOKEN ||
  process.env.IMPORT_TOKEN ||
  "";

if (!token) {
  console.error("Falta TIENDANUBE_IMPORT_TOKEN o IMPORT_TOKEN en .env.local");
  process.exit(1);
}

const results = [];

for (const orderId of ORDERS) {
  const res = await fetch(`${BASE}/api/tiendanube/orders-paid/import-orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-import-token": token,
    },
    body: JSON.stringify({
      fromISO: FROM,
      toISO: TO,
      singleOrderId: orderId,
      dryRun: true,
      importMp: false,
    }),
  });
  const json = await res.json();
  const preview = json.preview ?? json.data?.preview;
  results.push({
    orderId,
    http: res.status,
    ok: json.ok,
    step: json.step,
    wouldImport: json.metrics?.wouldImport,
    errors: json.errors,
    totalFinal: preview?.totalFinal ?? preview?.totales?.totalFinal,
    items: preview?.items?.map((i) => ({
      sku: i.sku,
      articulo: i.articulo,
      talle: i.talle,
      owner: i.owner,
      precioUnitario: i.precioUnitario,
      netoUnitario: i.netoUnitario,
    })),
  });
}

const out = path.join(process.cwd(), "_wip/fase-e2-gifty-dryrun.json");
fs.writeFileSync(out, JSON.stringify({ base: BASE, results }, null, 2));

console.log("=== FASE E.2 GIFTY dryRun ===");
console.log("Base:", BASE);
for (const r of results) {
  console.log("\n---", r.orderId, "---");
  console.table({
    ok: r.ok,
    step: r.step ?? "—",
    wouldImport: r.wouldImport,
    totalFinal: r.totalFinal,
    items: r.items?.length,
    errors: r.errors?.length ?? 0,
  });
  if (r.items?.length) console.table(r.items);
  if (r.errors?.length) console.table(r.errors);
}
console.log("\nJSON:", out);

const allOk = results.every(
  (r) =>
    r.ok &&
    r.wouldImport === 1 &&
    r.totalFinal === 70000 &&
    r.items?.length === 2 &&
    r.items.every((i) => i.sku === "GIFTY" && i.talle === "UNICO")
);
process.exit(allOk ? 0 : 1);
