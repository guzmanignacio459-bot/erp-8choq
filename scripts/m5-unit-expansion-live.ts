/**
 * M5.2a — Unit expansion live post-T0
 *
 * Dry-run:
 *   npm run m5:unit:expand:live
 *
 * Write:
 *   ERP_V2_DB_WRITE=true npm run m5:unit:expand:live -- --write
 */
import fs from "fs";
import path from "path";

import {
  evaluateM52bRecommendation,
  runPostT0UnitExpansionLive,
} from "../services/erp-v2-unit-expansion-live";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { loadEnvLocal } = require("./lib/l0-env.mjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createPrisma, disconnectPrisma } = require("./lib/l1-prisma.mjs");

const WIP = path.join(process.cwd(), "_wip");
const REPORT_PATH = path.join(WIP, "m5.2a-unit-expansion-report.json");

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
  const milestone = "M5.2a";
  requireEnv(write);

  const db = createPrisma();

  try {
    console.log(`[${milestone}] mode:`, write ? "write" : "dry-run");

    const result = await runPostT0UnitExpansionLive({ dryRun: !write });

    console.log(`[${milestone}] T0:`, result.stats.snapshotDate);
    console.log(`[${milestone}] post-T0 orders:`, result.stats.postT0OrdersScanned);
    console.log(`[${milestone}] pending lines:`, result.stats.pendingLines);
    console.log(`[${milestone}] expected new units:`, result.stats.expectedNewUnits);
    console.log(`[${milestone}] units created:`, result.stats.unitsCreated);
    console.log(`[${milestone}] qty parity:`, result.stats.qtyParityPass ? "PASS" : "FAIL");
    console.log(
      `[${milestone}] qty totals:`,
      `${result.stats.actualUnitsTotal}/${result.stats.expectedQtyTotal}`
    );
    if (result.errors.length) {
      console.log(`[${milestone}] errors:`, result.errors);
    }

    const m52bRecommendation = evaluateM52bRecommendation({
      dryRun: !write,
      errors: result.errors,
      stats: result.stats,
      idempotentSecondRun: idempotencyCheck,
    });

    const report = {
      generatedAt: new Date().toISOString(),
      milestone,
      mode: write ? "write" : "dry-run",
      idempotencyCheck,
      stats: result.stats,
      samples: result.samples,
      errors: result.errors,
      guards: {
        allocationsWritten: result.stats.allocationsWritten,
        stockMovementsWritten: result.stats.stockMovementsWritten,
        snapshotTouched: result.stats.snapshotTouched,
      },
      m52bRecommendation,
      pass: result.errors.length === 0,
    };

    fs.mkdirSync(WIP, { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    console.log(`[${milestone}] report:`, REPORT_PATH);
    console.log(`[${milestone}] M5.2b recommendation:`, m52bRecommendation);

    if (!report.pass) process.exitCode = 1;
  } finally {
    await disconnectPrisma(db);
  }
}

main().catch((err) => {
  console.error("[M5.2a] fatal:", err);
  process.exit(1);
});
