#!/usr/bin/env node
/**
 * M3.1b — Pilot sync MP → Neon (10 órdenes, staging only)
 *
 * Requiere: npm run build previo, ERP_V2_DB_WRITE=true, MP_ACCESS_TOKEN, Neon DATABASE_URL
 */

import { spawn } from "child_process";
import fs from "fs";
import path from "path";

import { loadEnvLocal } from "./lib/l0-env.mjs";
import { createPrisma, disconnectPrisma } from "./lib/l1-prisma.mjs";

const PORT = Number(process.env.M3_PILOT_PORT ?? 3459);
const BASE = `http://127.0.0.1:${PORT}`;
const PILOT_SIZE = 10;

loadEnvLocal();

function requirePilotEnv() {
  const missing = [];
  if (process.env.ERP_V2_DB_WRITE !== "true") missing.push("ERP_V2_DB_WRITE=true");
  if (!(process.env.DATABASE_URL ?? "").includes("neon.tech")) {
    missing.push("DATABASE_URL (Neon staging)");
  }
  if (!(process.env.MP_ACCESS_TOKEN ?? "").trim()) {
    missing.push("MP_ACCESS_TOKEN");
  }
  if (missing.length) {
    throw new Error(`Pilot env missing: ${missing.join(", ")}`);
  }
}

async function pickPilotTnIds(prisma) {
  const rows = await prisma.payment.findMany({
    where: {
      tnOrderId: { not: null },
      mpPaymentId: { not: null },
    },
    select: { tnOrderId: true, mpPaymentId: true },
    orderBy: { tnOrderId: "asc" },
    take: PILOT_SIZE,
  });
  return rows.map((r) => ({
    tnOrderId: r.tnOrderId,
    mpPaymentId: r.mpPaymentId,
  }));
}

function startNextServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "npx",
      ["next", "start", "-p", String(PORT)],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          ERP_V2_DB_WRITE: "true",
          ERP_V2_DB_READ: "true",
        },
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

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
      const res = await fetch(`${BASE}/api/v2/payments/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tnOrderIds: [] }),
      });
      if (res.status === 400 || res.status === 503 || res.status === 200) return;
    } catch {
      /* server booting */
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error("API not ready");
}

async function runSync(tnOrderIds) {
  const res = await fetch(`${BASE}/api/v2/payments/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tnOrderIds, force: false }),
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
    const sample = await pickPilotTnIds(prisma);
    if (sample.length < PILOT_SIZE) {
      console.warn(
        `[M3.1b pilot] only ${sample.length} orders available (wanted ${PILOT_SIZE})`
      );
    }
    const tnOrderIds = sample.map((s) => s.tnOrderId);
    console.log("[M3.1b pilot] sample:", sample);

    server = await startNextServer();
    await waitForApi();

    const { httpStatus, data } = await runSync(tnOrderIds);
    console.log("[M3.1b pilot] HTTP", httpStatus);
    console.log(JSON.stringify(data, null, 2));

    const outPath = path.join(process.cwd(), "_wip", "m3-mp-sync-pilot.json");
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(
      outPath,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          pilotSize: tnOrderIds.length,
          sample,
          httpStatus,
          response: data,
        },
        null,
        2
      )
    );
    console.log("[M3.1b pilot] report:", outPath);

    if (!data.ok || data.failed > 0) {
      process.exitCode = 1;
    }
  } finally {
    killServer(server);
    await disconnectPrisma(db);
  }
}

main().catch((e) => {
  console.error("[M3.1b pilot] failed:", e.message ?? e);
  process.exit(1);
});
