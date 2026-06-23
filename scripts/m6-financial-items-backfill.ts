/**
 * M6.1 — Backfill Financial Items from TN units + allocations
 *
 * Dry-run:
 *   npm run m6:financial-items:backfill
 *
 * Write:
 *   ERP_V2_DB_WRITE=true npm run m6:financial-items:backfill -- --write
 */
import fs from "fs";
import path from "path";

import { generateFinancialItemsFromTn } from "../services/financial-items/generate-from-tn";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { loadEnvLocal } = require("./lib/l0-env.mjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createPrisma, disconnectPrisma } = require("./lib/l1-prisma.mjs");

loadEnvLocal();

const WIP = path.join(process.cwd(), "_wip");
const REPORT_PATH = path.join(WIP, "m6-financial-items-backfill-report.json");

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
  const tnOrderId = process.argv.find((a) => a.startsWith("--order="))?.split("=")[1];

  requireEnv(write);

  const db = createPrisma();

  try {
    let cursor: string | null = null;
    let totals = {
      processed: 0,
      created: 0,
      updated: 0,
      skippedNoAllocation: 0,
      errors: 0,
      batches: 0,
    };

    console.log(`[M6.1] backfill start dryRun=${!write}`);

    for (;;) {
      const batch = await generateFinancialItemsFromTn({
        tnOrderId,
        dryRun: !write,
        cursor,
        maxBatches: 1,
        batchSize: 200,
      });

      totals.processed += batch.processed;
      totals.created += batch.created;
      totals.updated += batch.updated;
      totals.skippedNoAllocation += batch.skippedNoAllocation;
      totals.errors += batch.errors;
      totals.batches++;

      console.log(`[M6.1] batch ${totals.batches}`, {
        processed: batch.processed,
        created: batch.created,
        updated: batch.updated,
        skippedNoAllocation: batch.skippedNoAllocation,
        errors: batch.errors,
      });

      if (!batch.nextCursor || batch.processed === 0) break;
      if (batch.nextCursor === cursor) break;
      cursor = batch.nextCursor;
    }

    const report = {
      generatedAt: new Date().toISOString(),
      dryRun: !write,
      tnOrderId: tnOrderId ?? null,
      ...totals,
    };

    fs.mkdirSync(WIP, { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

    console.log("[M6.1] backfill done", report);
    console.log(`[M6.1] report → ${REPORT_PATH}`);

    if (totals.errors > 0) process.exitCode = 1;
  } finally {
    await disconnectPrisma(db);
  }
}

main().catch((err) => {
  console.error("[M6.1] fatal:", err);
  process.exit(1);
});
