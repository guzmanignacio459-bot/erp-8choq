#!/usr/bin/env node
/**
 * M4.2a — Pilot prorrateo comercial TN-only (25 órdenes, staging)
 *
 * Requiere: npm run build previo, ERP_V2_DB_WRITE=true, Neon DATABASE_URL
 */

import { spawn } from "child_process";
import fs from "fs";
import path from "path";

import { loadEnvLocal } from "./lib/l0-env.mjs";
import { createPrisma, disconnectPrisma } from "./lib/l1-prisma.mjs";

const PORT = Number(process.env.M4_PILOT_PORT ?? 3460);
const BASE = `http://127.0.0.1:${PORT}`;
const PILOT_SIZE = 25;
const WIP = path.join(process.cwd(), "_wip");

loadEnvLocal();

function requirePilotEnv() {
  const missing = [];
  if (process.env.ERP_V2_DB_WRITE !== "true") missing.push("ERP_V2_DB_WRITE=true");
  if (!(process.env.DATABASE_URL ?? "").includes("neon.tech")) {
    missing.push("DATABASE_URL (Neon staging)");
  }
  if (missing.length) {
    throw new Error(`Pilot env missing: ${missing.join(", ")}`);
  }
}

async function countTnOnlyUniverse(prisma) {
  const rows = await prisma.$queryRaw`
    SELECT
      COUNT(DISTINCT o.id)::int AS orders,
      COUNT(u.id)::int AS units
    FROM tn_orders o
    LEFT JOIN erp_orders e ON e.tn_order_id = o.id
    JOIN tn_order_item_units u ON u.tn_order_id = o.id
    WHERE e.id IS NULL
  `;
  return rows[0] ?? { orders: 0, units: 0 };
}

async function pickPilotTnIds(prisma) {
  const rows = await prisma.$queryRaw`
    SELECT o.id
    FROM tn_orders o
    LEFT JOIN erp_orders e ON e.tn_order_id = o.id
    WHERE e.id IS NULL
      AND EXISTS (
        SELECT 1 FROM tn_order_item_units u WHERE u.tn_order_id = o.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM tn_order_item_allocations a WHERE a.tn_order_id = o.id
      )
    ORDER BY o.id ASC
    LIMIT ${PILOT_SIZE}
  `;
  return rows.map((r) => String(r.id));
}

async function coverageAfterPilot(prisma, pilotIds) {
  const [allocRows, unitRows] = await Promise.all([
    prisma.$queryRaw`
      SELECT COUNT(*)::int AS n
      FROM tn_order_item_allocations a
      WHERE a.tn_order_id = ANY(${pilotIds}::text[])
    `,
    prisma.$queryRaw`
      SELECT COUNT(*)::int AS n
      FROM tn_order_item_units u
      WHERE u.tn_order_id = ANY(${pilotIds}::text[])
    `,
  ]);
  const allocations = allocRows[0]?.n ?? 0;
  const units = unitRows[0]?.n ?? 0;
  return {
    pilotOrders: pilotIds.length,
    pilotUnits: units,
    pilotAllocations: allocations,
    unitCoveragePct: units ? Math.round((allocations / units) * 10000) / 100 : 0,
  };
}

function startNextServer() {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["next", "start", "-p", String(PORT)], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ERP_V2_DB_WRITE: "true",
        ERP_V2_DB_READ: "true",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let started = false;
    const onData = (chunk) => {
      const text = chunk.toString();
      if (!started && /Ready|started server/i.test(text)) {
        started = true;
        resolve(child);
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("error", reject);
    child.on("exit", (code) => {
      if (!started) reject(new Error(`next start exited ${code}`));
    });

    setTimeout(() => {
      if (!started) {
        started = true;
        resolve(child);
      }
    }, 25000);
  });
}

async function waitForApi() {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/v2/allocations/commercial`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tnOrderIds: [] }),
      });
      if (res.status === 400 || res.status === 503 || res.status === 200) return;
    } catch {
      /* boot */
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error("API not ready");
}

async function runAllocate(tnOrderIds, dryRun = false) {
  const res = await fetch(`${BASE}/api/v2/allocations/commercial`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tnOrderIds, dryRun }),
  });
  const data = await res.json();
  return { httpStatus: res.status, data };
}

function killServer(child) {
  if (!child?.pid) return;
  child.kill("SIGTERM");
}

async function main() {
  requirePilotEnv();

  const db = createPrisma();
  const { prisma } = db;
  let server = null;

  try {
    const universe = await countTnOnlyUniverse(prisma);
    const tnOrderIds = await pickPilotTnIds(prisma);

    if (!tnOrderIds.length) {
      throw new Error("sin órdenes TN-only elegibles para pilot");
    }

    console.log("[M4.2a pilot] TN-only universe:", universe);
    console.log("[M4.2a pilot] sample size:", tnOrderIds.length);
    console.log("[M4.2a pilot] ids:", tnOrderIds);

    server = await startNextServer();
    await waitForApi();

    const dryRun = await runAllocate(tnOrderIds, true);
    console.log("[M4.2a pilot] dry-run HTTP", dryRun.httpStatus);
    if (!dryRun.data.ok) {
      console.log(JSON.stringify(dryRun.data, null, 2));
      throw new Error("dry-run validation failed");
    }

    const write = await runAllocate(tnOrderIds, false);
    console.log("[M4.2a pilot] write HTTP", write.httpStatus);
    console.log(JSON.stringify(write.data, null, 2));

    const coverage = await coverageAfterPilot(prisma, tnOrderIds);

    const report = {
      generatedAt: new Date().toISOString(),
      milestone: "M4.2a",
      pilotSize: tnOrderIds.length,
      tnOnlyUniverse: universe,
      tnOrderIds,
      dryRun: {
        httpStatus: dryRun.httpStatus,
        ok: dryRun.data.ok,
        validationFailures: dryRun.data.validationFailures ?? [],
      },
      write: {
        httpStatus: write.httpStatus,
        ok: write.data.ok,
        allocated: write.data.allocated,
        failed: write.data.failed,
        units: write.data.units,
        validationFailures: write.data.validationFailures ?? [],
      },
      coverage,
      validations: {
        "V-C1": "Σ discount_allocated = pool_discount",
        "V-C2": "Σ shipping_allocated = pool_shipping_owner",
        "V-C3": "Σ fee_allocated = pool_fee_commercial (0)",
        "V-C4": "Σ neto_prenda = Σ unit_price - Σ discount + Σ fee",
        "V-C5": "Σ unit_price ≈ tn_subtotal (±0.01)",
        "V-C6": "Σ neto_prenda + shipping_paid ≈ tn_total (±0.01)",
      },
    };

    fs.mkdirSync(WIP, { recursive: true });
    const outPath = path.join(WIP, "m4-allocate-commercial-pilot.json");
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log("[M4.2a pilot] report:", outPath);

    if (!write.data.ok || write.data.failed > 0) {
      process.exitCode = 1;
    }
  } finally {
    killServer(server);
    await disconnectPrisma(db);
  }
}

main().catch((e) => {
  console.error("[M4.2a pilot] failed:", e.message ?? e);
  process.exit(1);
});
