/**
 * M5.4a — Live pipeline scheduler (every 5 minutes, no overlap)
 *
 * Start daemon:
 *   ERP_V2_DB_WRITE=true npm run m5:scheduler:start
 *
 * Single tick (manual / test):
 *   ERP_V2_DB_WRITE=true npm run m5:scheduler:once
 */
import fs from "fs";
import path from "path";

import { executeMonitoredPipeline } from "../services/erp-v2-pipeline-monitor";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { loadEnvLocal } = require("./lib/l0-env.mjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createPrisma, disconnectPrisma } = require("./lib/l1-prisma.mjs");

loadEnvLocal();

const WIP = path.join(process.cwd(), "_wip");
const REPORT_PATH = path.join(WIP, "m5-scheduler-last-tick.json");

const INTERVAL_MS = 5 * 60 * 1000;
const MILESTONE = "M5.4a";

let inProcessTick = false;

function requireEnv() {
  const missing: string[] = [];
  if (!(process.env.DATABASE_URL ?? "").includes("neon.tech")) {
    missing.push("DATABASE_URL (Neon staging)");
  }
  if (!(process.env.TIENDANUBE_STORE_ID ?? "").trim()) {
    missing.push("TIENDANUBE_STORE_ID");
  }
  if (!(process.env.TIENDANUBE_ACCESS_TOKEN ?? "").trim()) {
    missing.push("TIENDANUBE_ACCESS_TOKEN");
  }
  if (process.env.ERP_V2_DB_WRITE !== "true") {
    missing.push("ERP_V2_DB_WRITE=true");
  }
  if (missing.length) throw new Error(`Env missing: ${missing.join(", ")}`);
}

async function runTick(): Promise<void> {
  if (inProcessTick) {
    console.log(`[${MILESTONE}] skip: previous tick still in process`);
    return;
  }

  inProcessTick = true;
  const tickStarted = new Date().toISOString();

  try {
    console.log(`[${MILESTONE}] tick start`, tickStarted);
    const result = await executeMonitoredPipeline({
      triggeredBy: "scheduler",
      dryRun: false,
    });

    const output = {
      generatedAt: new Date().toISOString(),
      tickStarted,
      ...result,
    };

    fs.mkdirSync(WIP, { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(output, null, 2));

    console.log(`[${MILESTONE}] tick done`, {
      runId: result.runId,
      status: result.status,
      lockAcquired: result.lockAcquired,
      alertSent: result.alertSent,
    });

    if (result.status === "failed" || result.status === "exception") {
      process.exitCode = 1;
    }
  } finally {
    inProcessTick = false;
  }
}

async function main() {
  const once = process.argv.includes("--once");
  requireEnv();

  const db = createPrisma();

  try {
    if (once) {
      await runTick();
      return;
    }

    console.log(`[${MILESTONE}] scheduler started — interval ${INTERVAL_MS / 1000}s`);
    await runTick();
    setInterval(() => {
      runTick().catch((err) => {
        console.error(`[${MILESTONE}] tick error:`, err);
      });
    }, INTERVAL_MS);
  } finally {
    if (once) {
      await disconnectPrisma(db);
    }
  }
}

main().catch((err) => {
  console.error(`[${MILESTONE}] fatal:`, err);
  process.exit(1);
});
