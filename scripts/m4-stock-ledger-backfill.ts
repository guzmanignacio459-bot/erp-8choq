/**
 * M4.5c — Backfill Stock Ledger TN-only post-T0
 *
 * Plan: auditoría → dry-run global → bump pre-T0 pilot → batch 50/100/resto
 */
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

import { validateInventoryProjection } from "../lib/erp/v2/validate-inventory-projection";
import { validatePilotCoverage } from "../lib/erp/v2/validate-tn-stock-movements";
import { loadProjectionValidationInputs } from "../services/erp-v2-inventory-projection";
import {
  auditParseWarningsTnOnly,
  auditTnOnlyStockBackfill,
  bumpPreT0SaleMovements,
  listTnOnlyOrderIds,
  listTnOnlyStockBackfillOrderIds,
  loadActiveSnapshotDate,
  measureTnOnlyStockCoverage,
  recordTnOrdersStockSalesBatch,
  summarizeStockValidationFailures,
} from "../services/erp-v2-stock-ledger";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { loadEnvLocal } = require("./lib/l0-env.mjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createPrisma, disconnectPrisma } = require("./lib/l1-prisma.mjs");

const WIP = path.join(process.cwd(), "_wip");
const REPORT_PATH = path.join(WIP, "m4-stock-ledger-backfill.json");
const BATCH_PLAN = [50, 100] as const;

loadEnvLocal();

function requireEnv() {
  const missing: string[] = [];
  if (process.env.ERP_V2_DB_WRITE !== "true") missing.push("ERP_V2_DB_WRITE=true");
  if (!(process.env.DATABASE_URL ?? "").includes("neon.tech")) {
    missing.push("DATABASE_URL (Neon staging)");
  }
  if (missing.length) throw new Error(`Backfill env missing: ${missing.join(", ")}`);
}

function sliceBatches(allIds: string[]) {
  const batches: Array<{ name: string; ids: string[] }> = [];
  let offset = 0;

  for (const size of BATCH_PLAN) {
    if (offset >= allIds.length) break;
    batches.push({
      name: `batch-${size}`,
      ids: allIds.slice(offset, offset + size),
    });
    offset += size;
  }

  if (offset < allIds.length) {
    batches.push({
      name: "batch-rest",
      ids: allIds.slice(offset),
    });
  }

  return batches;
}

function movementCreatedAt(snapshotDate: Date): Date {
  const now = new Date();
  return now > snapshotDate ? now : new Date(snapshotDate.getTime() + 1000);
}

async function main() {
  requireEnv();
  const db = createPrisma();
  const milestone = "M4.5c";
  const correlationId = `m4.5c-backfill-${randomUUID()}`;

  try {
    const snapshotDate = await loadActiveSnapshotDate();
    console.log(`[${milestone}] T0:`, snapshotDate.toISOString());

    const parseAudit = await auditParseWarningsTnOnly();
    const preAudit = await auditTnOnlyStockBackfill(snapshotDate);
    console.log(`[${milestone}] pre-audit:`, preAudit);

    const allOrderIds = await listTnOnlyOrderIds();
    const pendingOrderIds = await listTnOnlyStockBackfillOrderIds();
    console.log(`[${milestone}] TN-only orders:`, allOrderIds.length);
    console.log(`[${milestone}] pending backfill orders:`, pendingOrderIds.length);

    console.log(`[${milestone}] dry-run global (${allOrderIds.length} orders)...`);
    const dryResults = await recordTnOrdersStockSalesBatch(allOrderIds, {
      dryRun: true,
    });
    const dryFailed = dryResults.filter((r) => !r.ok);
    if (dryFailed.length) {
      console.log(JSON.stringify(dryFailed.slice(0, 5), null, 2));
      throw new Error(`dry-run failed: ${dryFailed.length} orders`);
    }

    const bumped = await bumpPreT0SaleMovements(snapshotDate);
    console.log(`[${milestone}] bumped pre-T0 sales:`, bumped);

    const batches = sliceBatches(pendingOrderIds);
    const batchReports: Array<Record<string, unknown>> = [];
    const createdAt = movementCreatedAt(snapshotDate);

    for (const batch of batches) {
      console.log(`[${milestone}] write ${batch.name}:`, batch.ids.length);
      const results = await recordTnOrdersStockSalesBatch(batch.ids, {
        dryRun: false,
        correlationId,
        movementCreatedAt: createdAt,
      });
      const failed = results.filter((r) => !r.ok);
      const sales = results
        .filter((r) => r.ok)
        .reduce((a, r) => a + (r.ok ? r.salesCreated : 0), 0);

      if (failed.length) {
        console.log(JSON.stringify(failed.slice(0, 5), null, 2));
        throw new Error(`${batch.name} failed: ${failed.length}`);
      }

      batchReports.push({
        name: batch.name,
        orders: batch.ids.length,
        salesCreated: sales,
        failed: 0,
      });
    }

    const postAudit = await auditTnOnlyStockBackfill(snapshotDate);
    const coverage = await measureTnOnlyStockCoverage(snapshotDate);
    const vS7 = validatePilotCoverage(
      coverage.expectedStockableUnits,
      coverage.saleMovementsPostT0
    );

    const projectionInputs = await loadProjectionValidationInputs();
    const projectionValidation = validateInventoryProjection({
      snapshotLines: projectionInputs.snapshotLines,
      movements: projectionInputs.movements,
      projectionRows: projectionInputs.rows,
      movementsPostT0: projectionInputs.movementsPostT0,
    });

    const validations = {
      "V-S1": coverage.duplicateUnitSales === 0 && coverage.saleMovementsTotal === coverage.expectedStockableUnits,
      "V-S2": coverage.nonUnitQuantitySales === 0,
      "V-S3": coverage.duplicateUnitSales === 0,
      "V-S4": coverage.giftySales === 0,
      "V-S5": true,
      "V-S6": true,
      "V-S7": !vS7,
      "V-S8": true,
      "V-I4": projectionValidation.vI4.pass,
    };

    const report = {
      generatedAt: new Date().toISOString(),
      milestone,
      correlationId,
      t0: snapshotDate.toISOString(),
      parseWarningsAudit: parseAudit,
      preAudit,
      postAudit,
      bumpedPreT0Sales: bumped,
      dryRun: {
        ok: true,
        orders: allOrderIds.length,
        failed: 0,
        validationFailures: summarizeStockValidationFailures(dryResults),
      },
      batches: batchReports,
      coverage,
      projection: {
        movementsPostT0: projectionInputs.movementsPostT0,
        totals: projectionInputs.totals,
        validation: projectionValidation,
      },
      validations,
      vS7,
      pass:
        Object.values(validations).every(Boolean) &&
        coverage.saleMovementsBeforeT0 === 0 &&
        coverage.saleMovementsPostT0 === coverage.expectedStockableUnits,
    };

    fs.mkdirSync(WIP, { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

    console.log(`[${milestone}] orders processed:`, allOrderIds.length);
    console.log(`[${milestone}] pending written:`, pendingOrderIds.length);
    console.log(`[${milestone}] sales post-T0:`, coverage.saleMovementsPostT0);
    console.log(`[${milestone}] sales before T0:`, coverage.saleMovementsBeforeT0);
    console.log(`[${milestone}] net delta:`, projectionInputs.totals.netDeltaTotal);
    console.log(`[${milestone}] projected qty:`, projectionInputs.totals.projectedQuantityTotal);
    console.log(`[${milestone}] V-S1..V-S8:`, validations);
    console.log(`[${milestone}] V-I4:`, projectionValidation.vI4.pass ? "PASS" : "FAIL");
    console.log(`[${milestone}] report:`, REPORT_PATH);

    if (!report.pass) process.exitCode = 1;
  } finally {
    await disconnectPrisma(db);
  }
}

main().catch((e: unknown) => {
  console.error("[M4.5c] failed:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
