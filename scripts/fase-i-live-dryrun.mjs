#!/usr/bin/env node
/**
 * FASE I.1a — dryRun del orquestador en vivo vía webhook simulate.
 *
 * Requiere servidor corriendo (local o prod con deploy I.1a).
 * Usa x-live-import-simulate + IMPORT_TOKEN mientras LIVE_IMPORT_ENABLED=false.
 *
 *   node scripts/fase-i-live-dryrun.mjs [baseUrl]
 */

import fs from "fs";
import path from "path";

const BASE =
  process.argv[2] ||
  process.env.PROD_URL ||
  "http://localhost:3000";

const CASES = [
  {
    id: "normal_mp",
    tnOrderId: process.env.FASE_I_NORMAL_TN || "1981390559",
    expectStatus: ["simulated", "imported", "duplicated"],
    note: "Orden MP pagada ya en ERP o importable",
  },
  {
    id: "duplicated",
    tnOrderId: process.env.FASE_I_DUP_TN || "1981390559",
    expectStatus: ["duplicated"],
    note: "Misma TN ya presente en REMITOS",
  },
  {
    id: "gifty",
    tnOrderId: "1981026616",
    expectStatus: ["simulated", "duplicated"],
    note: "GIFTY wallet",
  },
  {
    id: "custom_transfer",
    tnOrderId: "1979195700",
    expectStatus: ["simulated", "duplicated"],
    note: "Custom / transfer offline",
  },
  {
    id: "cancelled",
    tnOrderId: "1955271645",
    expectStatus: ["not_eligible"],
    note: "Cancelada / refunded en TN",
  },
];

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
  process.env.IMPORT_ORDERS_TOKEN ||
  process.env.IMPORT_TOKEN ||
  "";

if (!token) {
  console.error("Falta IMPORT_TOKEN en .env.local");
  process.exit(1);
}

const WEBHOOK = `${BASE}/api/tiendanube/webhook/order-paid`;

async function runCase(testCase) {
  const res = await fetch(WEBHOOK, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-import-token": token,
      "x-live-import-simulate": "1",
    },
    body: JSON.stringify({
      id: testCase.tnOrderId,
      event: "order/paid",
    }),
  });

  const json = await res.json();
  const payload = json.result ?? json;
  const status = payload.status;
  const ok =
    res.ok &&
    json.ok !== false &&
    testCase.expectStatus.includes(status);

  return {
    ...testCase,
    http: res.status,
    responseOk: json.ok,
    status,
    reason: payload.reason,
    dryRun: payload.dryRun,
    simulate: payload.simulate,
    skipped: json.skipped,
    wouldImport: payload.importResult?.metrics?.wouldImport,
    errors: payload.importResult?.errors ?? payload.errors,
    pass: ok,
  };
}

console.log("=== FASE I.1a live dryRun ===");
console.log("Base:", BASE);
console.log("Webhook:", WEBHOOK);
console.log("Simulate: x-live-import-simulate=1 (ENABLED=false OK)\n");

const results = [];
for (const c of CASES) {
  const r = await runCase(c);
  results.push(r);
  console.log(
    `${r.pass ? "✓" : "✗"} ${c.id} | TN ${c.tnOrderId} | status=${r.status} | reason=${r.reason ?? "-"}`
  );
}

const out = path.join(process.cwd(), "_wip/fase-i-live-dryrun.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ base: BASE, results }, null, 2));

console.log("\n=== Resumen ===");
console.table(
  results.map((r) => ({
    caso: r.id,
    tn: r.tnOrderId,
    status: r.status,
    pass: r.pass,
  }))
);

const failed = results.filter((r) => !r.pass);
console.log("JSON:", out);

if (failed.length) {
  console.error(`\n${failed.length} caso(s) fallaron`);
  process.exit(1);
}

console.log("\nTodos los casos dryRun OK.");
