/**
 * M4.2c — Backfill MP allocations (695 órdenes payment+units, staging)
 *
 * Plan: auditoría → dry-run global → batch 50 → batch 100 → resto
 */
import fs from "fs";
import path from "path";

import {
  allocateTnOrdersMpBackfill,
  auditPaymentsModel,
  listMpEligibleOrderIds,
  measureMpCoverage,
  summarizeMpBatchResults,
} from "../services/erp-v2-allocations-mp";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { loadEnvLocal } = require("./lib/l0-env.mjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createPrisma, disconnectPrisma } = require("./lib/l1-prisma.mjs");

const WIP = path.join(process.cwd(), "_wip");
const BATCH_PLAN = [50, 100] as const;

loadEnvLocal();

function requireEnv() {
  const missing: string[] = [];
  if (process.env.ERP_V2_DB_WRITE !== "true") missing.push("ERP_V2_DB_WRITE=true");
  if (!(process.env.DATABASE_URL ?? "").includes("neon.tech")) {
    missing.push("DATABASE_URL (Neon staging)");
  }
  if (missing.length) {
    throw new Error(`Backfill env missing: ${missing.join(", ")}`);
  }
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

async function main() {
  requireEnv();

  const report: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    milestone: "M4.2c-backfill",
  };

  const db = createPrisma();

  try {
    const preAudit = await auditPaymentsModel();
    console.log("[M4.2c backfill] pre-audit:", preAudit);
    report.preAudit = preAudit;

    const allIds = await listMpEligibleOrderIds();
    console.log("[M4.2c backfill] eligible orders:", allIds.length);
    report.eligibleOrderCount = allIds.length;

    console.log("[M4.2c backfill] dry-run global...");
    const dryResults = await allocateTnOrdersMpBackfill(allIds, {
      dryRun: true,
      ensureCommercial: true,
    });
    const dryFailed = dryResults.filter((r) => !r.ok);
    const drySummary = summarizeMpBatchResults(dryResults);
    console.log("[M4.2c backfill] dry-run failed:", dryFailed.length);
    report.dryRun = {
      ok: dryFailed.length === 0,
      orders: allIds.length,
      failed: dryFailed.length,
      units: drySummary.unitsProcessed,
      validationFailures: drySummary.validationFailures,
    };

    if (dryFailed.length > 0) {
      console.log(JSON.stringify(dryFailed.slice(0, 5), null, 2));
      throw new Error("dry-run global falló — abortando backfill");
    }

    const batches = sliceBatches(allIds);
    const batchReports: Array<Record<string, unknown>> = [];

    for (const batch of batches) {
      console.log(
        `[M4.2c backfill] write ${batch.name}: ${batch.ids.length} órdenes...`
      );
      const results = await allocateTnOrdersMpBackfill(batch.ids, {
        dryRun: false,
        ensureCommercial: true,
      });
      const failed = results.filter((r) => !r.ok);
      const coverage = await measureMpCoverage();
      const summary = summarizeMpBatchResults(results);

      console.log(
        `[M4.2c backfill] ${batch.name}: failed=${failed.length} coverage=${coverage.orderCoveragePct}%`
      );

      if (failed.length > 0) {
        console.log(JSON.stringify(failed.slice(0, 3), null, 2));
        throw new Error(`${batch.name} falló validación`);
      }

      batchReports.push({
        name: batch.name,
        orders: batch.ids.length,
        failed: failed.length,
        units: summary.unitsProcessed,
        validationFailures: summary.validationFailures,
        coverage,
      });
    }

    report.batches = batchReports;

    const finalCoverage = await measureMpCoverage();
    const finalAudit = await auditPaymentsModel();

    const finalPass =
      finalCoverage.eligibleOrders === finalCoverage.mpAllocatedOrders &&
      finalCoverage.eligibleUnits === finalCoverage.mpAllocatedUnits;

    report.final = {
      coverage: finalCoverage,
      audit: finalAudit,
      validations: {
        "V-M1": "Σ fee_allocated = mp_fee_total",
        "V-M2": "Σ tax_allocated = mp_tax_total",
        "V-M3": "Σ financing_allocated = mp_financing_cost",
        "V-M4": "Σ neto_prenda_real = mp_neto_real_orden",
      },
      validationFailures: [],
      pass: finalPass,
    };

    fs.mkdirSync(WIP, { recursive: true });
    const outPath = path.join(WIP, "m4-allocate-mp-backfill.json");
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log("[M4.2c backfill] report:", outPath);
    console.log("[M4.2c backfill] final coverage:", finalCoverage);

    if (!finalPass) {
      process.exitCode = 1;
    }
  } finally {
    await disconnectPrisma(db);
  }
}

main().catch((e: unknown) => {
  const message = e instanceof Error ? e.message : String(e);
  console.error("[M4.2c backfill] failed:", message);
  process.exit(1);
});
