/**
 * M5.2d — Stock ledger live post-T0
 */
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

import {
  evaluateM53Recommendation,
  runPostT0StockLedgerLive,
} from "../services/erp-v2-stock-ledger-live";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { loadEnvLocal } = require("./lib/l0-env.mjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createPrisma, disconnectPrisma } = require("./lib/l1-prisma.mjs");

const WIP = path.join(process.cwd(), "_wip");
const REPORT_PATH = path.join(WIP, "m5.2d-stock-ledger-live-report.json");

loadEnvLocal();

function requireEnv(write: boolean) {
  const missing: string[] = [];
  if (!(process.env.DATABASE_URL ?? "").includes("neon.tech")) {
    missing.push("DATABASE_URL (Neon staging)");
  }
  if (write && process.env.ERP_V2_DB_WRITE !== "true") {
    missing.push("ERP_V2_DB_WRITE=true");
  }
  if (missing.length) throw new Error(`Env missing: ${missing.join(", ")}`);
}

async function main() {
  const write = process.argv.includes("--write");
  const idempotencyCheck = process.argv.includes("--idempotency-check");
  const milestone = "M5.2d";
  requireEnv(write);

  const db = createPrisma();

  try {
    console.log(`[${milestone}] mode:`, write ? "write" : "dry-run");

    const result = await runPostT0StockLedgerLive({
      dryRun: !write,
      correlationId: `m5.2d-live-${randomUUID()}`,
      runProjectionVerify: write,
    });

    console.log(`[${milestone}] T0:`, result.stats.snapshotDate);
    console.log(`[${milestone}] pre-audit:`, result.preAudit);
    console.log(`[${milestone}] orders processed:`, result.stats.ordersProcessed);
    console.log(`[${milestone}] orders skipped:`, result.stats.ordersSkipped);
    console.log(`[${milestone}] orders failed:`, result.stats.ordersFailed);
    console.log(`[${milestone}] movements created:`, result.stats.movementsCreated);
    console.log(`[${milestone}] V-S checks:`, result.stats.validationChecks);
    console.log(`[${milestone}] L-S checks:`, result.stats.liveChecks);
    if (result.projectionVerify) {
      console.log(`[${milestone}] projection verify:`, result.projectionVerify);
    }
    if (result.errors.length) {
      console.log(`[${milestone}] errors:`, result.errors);
    }

    if (idempotencyCheck) {
      result.stats.liveChecks["L-S3"] =
        result.stats.movementsCreated === 0 ? "PASS" : "FAIL";
    }

    const m53Recommendation = evaluateM53Recommendation({
      errors: result.errors,
      stats: result.stats,
      projectionVerify: result.projectionVerify,
      idempotentSecondRun: idempotencyCheck,
    });

    const report = {
      generatedAt: new Date().toISOString(),
      milestone,
      mode: write ? "write" : "dry-run",
      idempotencyCheck,
      preAudit: result.preAudit,
      stats: result.stats,
      validationChecks: result.stats.validationChecks,
      liveChecks: result.stats.liveChecks,
      projectionVerify: result.projectionVerify,
      samples: result.orderResults.slice(0, 10),
      errors: result.errors,
      guards: {
        snapshotTouched: result.stats.snapshotTouched,
        projectionTouched: result.stats.projectionTouched,
        allocationsWritten: result.stats.allocationsWritten,
      },
      m53Recommendation,
      pass: result.errors.length === 0,
    };

    fs.mkdirSync(WIP, { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    console.log(`[${milestone}] report:`, REPORT_PATH);
    console.log(`[${milestone}] M5.3 recommendation:`, m53Recommendation);

    if (!report.pass) process.exitCode = 1;
  } finally {
    await disconnectPrisma(db);
  }
}

main().catch((err) => {
  console.error("[M5.2d] fatal:", err);
  process.exit(1);
});
