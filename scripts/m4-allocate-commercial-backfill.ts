/**
 * M4.2b — Backfill allocations comerciales TN-only (staging)
 *
 * Plan: auditoría → dry-run global → batch 50 → batch 100 → resto
 */
import fs from "fs";
import path from "path";

import {
  allocateTnOrdersCommercialBackfill,
  auditTnOnlyUniverse,
  listTnOnlyOrderIds,
  measureTnOnlyCoverage,
  summarizeBatchResults,
} from "../services/erp-v2-allocations-commercial";

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

  const startedAt = new Date().toISOString();
  const report: Record<string, unknown> = {
    generatedAt: startedAt,
    milestone: "M4.2b",
  };

  const db = createPrisma();

  try {
    const preAudit = await auditTnOnlyUniverse();
    console.log("[M4.2b] pre-audit:", preAudit);
    report.preAudit = preAudit;

    const allIds = await listTnOnlyOrderIds();
    console.log("[M4.2b] TN-only orders:", allIds.length);
    report.tnOnlyOrderCount = allIds.length;

    console.log("[M4.2b] dry-run global...");
    const dryResults = await allocateTnOrdersCommercialBackfill(allIds, {
      dryRun: true,
    });
    const dryFailed = dryResults.filter((r) => !r.ok);
    const drySummary = summarizeBatchResults(
      dryResults,
      await measureTnOnlyCoverage()
    );
    console.log("[M4.2b] dry-run failed:", dryFailed.length);
    report.dryRun = {
      ok: dryFailed.length === 0,
      orders: allIds.length,
      failed: dryFailed.length,
      units: drySummary.unitsProcessed,
      validationFailures: drySummary.validationFailures,
      auditV6: drySummary.auditV6,
    };

    if (dryFailed.length > 0) {
      console.log(JSON.stringify(dryFailed.slice(0, 5), null, 2));
      throw new Error("dry-run global falló — abortando backfill");
    }

    const batches = sliceBatches(allIds);
    const batchReports: Array<Record<string, unknown>> = [];

    for (const batch of batches) {
      console.log(
        `[M4.2b] write ${batch.name}: ${batch.ids.length} órdenes...`
      );
      const results = await allocateTnOrdersCommercialBackfill(batch.ids, {
        dryRun: false,
      });
      const failed = results.filter((r) => !r.ok);
      const coverage = await measureTnOnlyCoverage();
      const summary = summarizeBatchResults(results, coverage);

      console.log(
        `[M4.2b] ${batch.name}: failed=${failed.length} coverage=${coverage.unitCoveragePct}%`
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
        auditV6: summary.auditV6,
      });
    }

    report.batches = batchReports;

    const finalCoverage = await measureTnOnlyCoverage();
    const finalAudit = await auditTnOnlyUniverse();

    const finalPass =
      finalCoverage.tnOnlyOrders === finalCoverage.allocatedOrders &&
      finalCoverage.tnOnlyUnits === finalCoverage.allocatedUnits &&
      finalCoverage.duplicateUnitAllocations === 0;

    report.final = {
      coverage: finalCoverage,
      audit: finalAudit,
      validations: {
        "V-C1": "Σ discount_allocated = tn_discount",
        "V-C2": "Σ shipping_allocated = shipping pool",
        "V-C3": "Σ gross_unit_amount = subtotal esperado",
        "V-C4": "No allocations negativas",
        "V-C5": "1 allocation por unidad",
        "V-C6": "Auditoría inferencia descuento vs tn_discount",
      },
      pass: finalPass,
    };

    fs.mkdirSync(WIP, { recursive: true });
    const outPath = path.join(WIP, "m4-allocate-commercial-backfill.json");
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log("[M4.2b] report:", outPath);
    console.log("[M4.2b] final coverage:", finalCoverage);

    if (!finalPass) {
      process.exitCode = 1;
    }
  } finally {
    await disconnectPrisma(db);
  }
}

main().catch((e: unknown) => {
  const message = e instanceof Error ? e.message : String(e);
  console.error("[M4.2b] failed:", message);
  process.exit(1);
});
