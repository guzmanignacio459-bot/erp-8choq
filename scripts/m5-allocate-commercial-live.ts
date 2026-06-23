/**
 * M5.2b — Commercial allocations live post-T0
 *
 * Dry-run:
 *   npm run m5:alloc:commercial:live
 *
 * Write:
 *   ERP_V2_DB_WRITE=true npm run m5:alloc:commercial:live -- --write
 */
import fs from "fs";
import path from "path";

import {
  evaluateM52cRecommendation,
  runPostT0CommercialAllocationLive,
} from "../services/erp-v2-allocations-commercial-live";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { loadEnvLocal } = require("./lib/l0-env.mjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createPrisma, disconnectPrisma } = require("./lib/l1-prisma.mjs");

const WIP = path.join(process.cwd(), "_wip");
const REPORT_PATH = path.join(
  WIP,
  "m5.2b-commercial-allocation-live-report.json"
);

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
  const milestone = "M5.2b";
  requireEnv(write);

  const db = createPrisma();

  try {
    console.log(`[${milestone}] mode:`, write ? "write" : "dry-run");

    const result = await runPostT0CommercialAllocationLive({ dryRun: !write });

    console.log(`[${milestone}] T0:`, result.stats.snapshotDate);
    console.log(`[${milestone}] pre-audit:`, result.preAudit);
    console.log(`[${milestone}] orders processed:`, result.stats.ordersProcessed);
    console.log(`[${milestone}] orders skipped:`, result.stats.ordersSkipped);
    console.log(`[${milestone}] orders failed:`, result.stats.ordersFailed);
    console.log(`[${milestone}] units processed:`, result.stats.unitsProcessed);
    console.log(
      `[${milestone}] allocations created:`,
      result.stats.allocationsCreated
    );
    console.log(`[${milestone}] V-C checks:`, result.stats.validationChecks);
    console.log(`[${milestone}] L-C checks:`, result.stats.liveChecks);
    console.log(`[${milestone}] audit V-C6:`, result.auditV6);
    if (result.errors.length) {
      console.log(`[${milestone}] errors:`, result.errors);
    }

    if (idempotencyCheck) {
      result.stats.liveChecks["L-C3"] =
        result.stats.allocationsCreated === 0 ? "PASS" : "FAIL";
    }

    const m52cRecommendation = evaluateM52cRecommendation({
      dryRun: !write,
      errors: result.errors,
      stats: result.stats,
      auditV6: result.auditV6,
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
      auditV6: result.auditV6,
      samples: result.orderResults.slice(0, 10),
      errors: result.errors,
      guards: {
        unitsWritten: result.stats.unitsWritten,
        mpAllocationsWritten: result.stats.mpAllocationsWritten,
        stockMovementsWritten: result.stats.stockMovementsWritten,
        snapshotTouched: result.stats.snapshotTouched,
      },
      m52cRecommendation,
      pass: result.errors.length === 0,
    };

    fs.mkdirSync(WIP, { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    console.log(`[${milestone}] report:`, REPORT_PATH);
    console.log(`[${milestone}] M5.2c recommendation:`, m52cRecommendation);

    if (!report.pass) process.exitCode = 1;
  } finally {
    await disconnectPrisma(db);
  }
}

main().catch((err) => {
  console.error("[M5.2b] fatal:", err);
  process.exit(1);
});
