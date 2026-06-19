/**
 * M5.2c — MP allocations live post-T0
 *
 * Dry-run:
 *   npm run m5:alloc:mp:live
 *
 * Write:
 *   ERP_V2_DB_WRITE=true npm run m5:alloc:mp:live -- --write
 */
import fs from "fs";
import path from "path";

import {
  evaluateM52dRecommendation,
  runPostT0MpAllocationLive,
} from "../services/erp-v2-allocations-mp-live";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { loadEnvLocal } = require("./lib/l0-env.mjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createPrisma, disconnectPrisma } = require("./lib/l1-prisma.mjs");

const WIP = path.join(process.cwd(), "_wip");
const REPORT_PATH = path.join(WIP, "m5.2c-mp-allocation-live-report.json");

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
  const milestone = "M5.2c";
  requireEnv(write);

  const db = createPrisma();

  try {
    console.log(`[${milestone}] mode:`, write ? "write" : "dry-run");

    const result = await runPostT0MpAllocationLive({ dryRun: !write });

    console.log(`[${milestone}] T0:`, result.stats.snapshotDate);
    console.log(`[${milestone}] pre-audit:`, result.preAudit);
    console.log(`[${milestone}] orders processed:`, result.stats.ordersProcessed);
    console.log(`[${milestone}] orders skipped:`, result.stats.ordersSkipped);
    console.log(`[${milestone}] orders failed:`, result.stats.ordersFailed);
    console.log(`[${milestone}] units processed:`, result.stats.unitsProcessed);
    console.log(
      `[${milestone}] allocations enriched:`,
      result.stats.allocationsEnriched
    );
    console.log(`[${milestone}] V-M checks:`, result.stats.validationChecks);
    console.log(`[${milestone}] L-M checks:`, result.stats.liveChecks);
    if (result.errors.length) {
      console.log(`[${milestone}] errors:`, result.errors);
    }

    if (idempotencyCheck) {
      result.stats.liveChecks["L-M3"] =
        result.stats.allocationsEnriched === 0 ? "PASS" : "FAIL";
    }

    const m52dRecommendation = evaluateM52dRecommendation({
      errors: result.errors,
      stats: result.stats,
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
      samples: result.orderResults.slice(0, 10),
      errors: result.errors,
      guards: {
        unitsWritten: result.stats.unitsWritten,
        commercialAllocationsWritten: result.stats.commercialAllocationsWritten,
        stockMovementsWritten: result.stats.stockMovementsWritten,
        snapshotTouched: result.stats.snapshotTouched,
      },
      m52dRecommendation,
      pass: result.errors.length === 0,
    };

    fs.mkdirSync(WIP, { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    console.log(`[${milestone}] report:`, REPORT_PATH);
    console.log(`[${milestone}] M5.2d recommendation:`, m52dRecommendation);

    if (!report.pass) process.exitCode = 1;
  } finally {
    await disconnectPrisma(db);
  }
}

main().catch((err) => {
  console.error("[M5.2c] fatal:", err);
  process.exit(1);
});
