#!/usr/bin/env node
/**
 * FASE E.3 — prod dryRun + import GIFTY controlado.
 *   node scripts/fase-e3-gifty-prod.mjs dryrun
 *   node scripts/fase-e3-gifty-prod.mjs import 1981026616
 *   node scripts/fase-e3-gifty-prod.mjs validate
 */

import fs from "fs";
import path from "path";

const PROD =
  process.env.PROD_URL ??
  "https://nextjs-boilerplate-topaz-iota-40.vercel.app";
const ORDERS = ["1981026616", "1980843190"];
const FROM = "2026-05-27T00:00:00.000Z";
const TO = "2026-05-31T23:59:59.999Z";
const MAYO_FROM = "2026-05-01";
const MAYO_TO = "2026-05-31";

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

async function importOrder(orderId, dryRun) {
  const res = await fetch(`${PROD}/api/tiendanube/orders-paid/import-orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-import-token": token,
    },
    body: JSON.stringify({
      fromISO: FROM,
      toISO: TO,
      singleOrderId: String(orderId),
      dryRun,
      importMp: false,
    }),
  });
  const json = await res.json();
  const preview = json.preview;
  return {
    orderId,
    http: res.status,
    ok: json.ok,
    step: json.step,
    wouldImport: json.metrics?.wouldImport,
    imported: json.metrics?.imported,
    duplicated: json.metrics?.duplicated,
    errors: json.errors ?? [],
    totalFinal: preview?.totalFinal ?? preview?.totales?.totalFinal,
    items: preview?.items?.map((i) => ({
      sku: i.sku,
      articulo: i.articulo,
      talle: i.talle,
      owner: i.owner,
      precioUnitario: i.precioUnitario,
    })),
    gasResult: json.result,
    build: json.build,
    message: json.message,
  };
}

function gateOk(r) {
  if (!r.ok) return false;
  if (r.errors?.length) return false;
  const items = r.items ?? [];
  return (
    (r.wouldImport === 1 || r.imported === 1) &&
    r.totalFinal === 70000 &&
    items.length === 2 &&
    items.every((i) => i.sku === "GIFTY" && i.talle === "UNICO")
  );
}

function gasUrl() {
  return process.env.APPS_SCRIPT_URL ?? process.env.GAS_WEBAPP_URL ?? "";
}

async function gasPing() {
  const GAS_URL = gasUrl();
  if (!GAS_URL) return { ok: false, error: "no GAS_URL" };
  const res = await fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method: "ping", token: process.env.APPS_SCRIPT_TOKEN ?? "" }),
  });
  const text = await res.text();
  try {
    return { ok: true, data: JSON.parse(text), url: GAS_URL };
  } catch {
    return { ok: true, raw: text.slice(0, 200), url: GAS_URL };
  }
}

async function validateMayo() {
  const a = await fetch(`${PROD}/api/erp/analytics?from=${MAYO_FROM}&to=${MAYO_TO}`).then((r) =>
    r.json()
  );
  const remitos = await fetch(`${PROD}/api/erp/remitos`).then((r) => r.json());
  const mayo = (remitos.data ?? []).filter((r) => {
    const d = String(r.fechaRaw ?? "").slice(0, 10);
    return d >= MAYO_FROM && d <= MAYO_TO;
  });
  const byTn = new Map();
  for (const r of mayo) {
    const tn = String(r.tnOrderId ?? "").trim();
    if (!tn) continue;
    if (!byTn.has(tn)) byTn.set(tn, []);
    byTn.get(tn).push(r.idRemito);
  }
  const dups = [...byTn.entries()].filter(([, v]) => v.length > 1);
  const gifty = mayo.filter((r) => ORDERS.includes(String(r.tnOrderId)));
  return {
    analytics: a.data?.totals,
    mayoRemitos: mayo.length,
    duplicados: dups.length,
    giftyRemitos: gifty.map((r) => ({
      idRemito: r.idRemito,
      tn: r.tnOrderId,
      totalFinal: r.totalFinal,
    })),
  };
}

const mode = process.argv[2] ?? "dryrun";
const orderArg = process.argv[3];

if (!token) {
  console.error("Falta IMPORT_TOKEN");
  process.exit(1);
}

if (mode === "gas-ping") {
  console.log(await gasPing());
  process.exit(0);
}

if (mode === "validate") {
  console.log(JSON.stringify(await validateMayo(), null, 2));
  process.exit(0);
}

if (mode === "dryrun") {
  console.log("PROD:", PROD);
  console.log("GAS:", gasUrl());
  const ping = await gasPing();
  console.log("GAS ping:", ping);
  const results = [];
  for (const id of ORDERS) {
    results.push(await importOrder(id, true));
    await new Promise((r) => setTimeout(r, 500));
  }
  const out = path.join(process.cwd(), "_wip/fase-e3-prod-dryrun.json");
  fs.writeFileSync(out, JSON.stringify({ results, ping }, null, 2));
  for (const r of results) {
    console.log("\n---", r.orderId, gateOk(r) ? "PASS" : "FAIL", "---");
    console.table({
      ok: r.ok,
      wouldImport: r.wouldImport,
      totalFinal: r.totalFinal,
      items: r.items?.length,
      errors: r.errors.length,
      step: r.step,
    });
    if (r.items?.length) console.table(r.items);
    if (r.errors.length) console.table(r.errors);
  }
  const allPass = results.every(gateOk);
  console.log("\nGate:", allPass ? "PASS" : "FAIL", out);
  process.exit(allPass ? 0 : 1);
}

if (mode === "import") {
  const id = orderArg;
  if (!id) {
    console.error("Uso: import <orderId>");
    process.exit(1);
  }
  const r = await importOrder(id, false);
  console.log(JSON.stringify(r, null, 2));
  const ok =
    r.ok &&
    !r.errors?.length &&
    (r.imported === 1 || r.gasResult?.ok) &&
    !r.duplicated;
  process.exit(ok ? 0 : 1);
}

console.error("Modos: dryrun | import <id> | validate | gas-ping");
process.exit(1);
