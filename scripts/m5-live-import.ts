/**
 * M5.1 — Incremental Live Import TN → Neon
 *
 * Dry-run (default):
 *   npm run m5:live:import
 *
 * Write:
 *   ERP_V2_DB_WRITE=true npm run m5:live:import -- --write
 */
import fs from "fs";
import path from "path";

import {
  evaluateM52Recommendation,
  liveImportOverlapSeconds,
  loadSyncWatermark,
  runIncrementalLiveImport,
} from "../services/erp-v2-live-import";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { loadEnvLocal } = require("./lib/l0-env.mjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createPrisma, disconnectPrisma } = require("./lib/l1-prisma.mjs");

const WIP = path.join(process.cwd(), "_wip");
const REPORT_PATH = path.join(WIP, "m5-live-import-report.json");

loadEnvLocal();

function requireEnv(write: boolean) {
  const missing: string[] = [];
  if (!(process.env.TIENDANUBE_STORE_ID ?? "").trim()) {
    missing.push("TIENDANUBE_STORE_ID");
  }
  if (!(process.env.TIENDANUBE_ACCESS_TOKEN ?? "").trim()) {
    missing.push("TIENDANUBE_ACCESS_TOKEN");
  }
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
  const milestone = "M5.1";
  requireEnv(write);

  const db = createPrisma();

  try {
    const watermarkMeta = await loadSyncWatermark();
    console.log(`[${milestone}] mode:`, write ? "write" : "dry-run");
    console.log(`[${milestone}] watermark:`, watermarkMeta.watermark.toISOString());
    console.log(`[${milestone}] watermark source:`, watermarkMeta.source);
    console.log(`[${milestone}] overlap seconds:`, liveImportOverlapSeconds());

    const result = await runIncrementalLiveImport({ dryRun: !write });

    console.log(`[${milestone}] fetched:`, result.stats.fetched);
    console.log(`[${milestone}] classified:`, result.stats.classified);
    console.log(`[${milestone}] orders created:`, result.stats.ordersCreated);
    console.log(`[${milestone}] orders updated:`, result.stats.ordersUpdated);
    console.log(
      `[${milestone}] items skipped (units protected):`,
      result.stats.itemsSkippedProtected
    );
    if (result.stats.watermarkAfter) {
      console.log(`[${milestone}] watermark after:`, result.stats.watermarkAfter);
    }
    if (result.errors.length) {
      console.log(`[${milestone}] errors:`, result.errors);
    }

    const m52Recommendation = evaluateM52Recommendation({
      dryRun: !write,
      errors: result.errors,
      stats: result.stats,
      writeExecuted: write,
    });

    const report = {
      generatedAt: new Date().toISOString(),
      milestone,
      mode: write ? "write" : "dry-run",
      watermark: {
        before: result.stats.watermarkBefore,
        queryFrom: result.stats.watermarkQueryFrom,
        after: result.stats.watermarkAfter,
        source: watermarkMeta.source,
        overlapSeconds: liveImportOverlapSeconds(),
      },
      tnEnv: result.tnEnv,
      scope: result.scope,
      stats: result.stats,
      samples: result.samples,
      errors: result.errors,
      guards: {
        stockLedgerTouched: result.stats.stockLedgerTouched,
        snapshotTouched: result.stats.snapshotTouched,
        stockMovementsWritten: false,
      },
      m52Recommendation,
      pass: result.errors.length === 0,
    };

    fs.mkdirSync(WIP, { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    console.log(`[${milestone}] report:`, REPORT_PATH);
    console.log(`[${milestone}] M5.2 recommendation:`, m52Recommendation);

    if (!report.pass) process.exitCode = 1;
  } finally {
    await disconnectPrisma(db);
  }
}

main().catch((err) => {
  console.error("[M5.1] fatal:", err);
  process.exit(1);
});
