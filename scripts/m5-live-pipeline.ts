/**
 * M5.3 — Live pipeline orchestrator
 *
 * Dry-run (default):
 *   npm run m5:pipeline:live
 *
 * Write:
 *   ERP_V2_DB_WRITE=true npm run m5:pipeline:live -- --write
 *
 * Projection only:
 *   npm run m5:pipeline:live -- --report-only
 */
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

import {
  evaluatePipelineGo,
  runLivePipeline,
} from "../services/erp-v2-live-pipeline";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { loadEnvLocal } = require("./lib/l0-env.mjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createPrisma, disconnectPrisma } = require("./lib/l1-prisma.mjs");

const WIP = path.join(process.cwd(), "_wip");
const REPORT_PATH = path.join(WIP, "m5-live-pipeline-report.json");

loadEnvLocal();

function parseFlags(argv: string[]) {
  return {
    write: argv.includes("--write"),
    reportOnly: argv.includes("--report-only"),
    idempotencyCheck: argv.includes("--idempotency-check"),
  };
}

function requireEnv(write: boolean, reportOnly: boolean) {
  const missing: string[] = [];
  if (!(process.env.DATABASE_URL ?? "").includes("neon.tech")) {
    missing.push("DATABASE_URL (Neon staging)");
  }
  if (!reportOnly) {
    if (!(process.env.TIENDANUBE_STORE_ID ?? "").trim()) {
      missing.push("TIENDANUBE_STORE_ID");
    }
    if (!(process.env.TIENDANUBE_ACCESS_TOKEN ?? "").trim()) {
      missing.push("TIENDANUBE_ACCESS_TOKEN");
    }
  }
  if (write && process.env.ERP_V2_DB_WRITE !== "true") {
    missing.push("ERP_V2_DB_WRITE=true");
  }
  if (missing.length) throw new Error(`Env missing: ${missing.join(", ")}`);
}

async function main() {
  const flags = parseFlags(process.argv);
  const milestone = "M5.3";
  const dryRun = !flags.write && !flags.reportOnly;
  requireEnv(flags.write, flags.reportOnly);

  const db = createPrisma();

  try {
    const modeLabel = flags.reportOnly
      ? "report-only"
      : flags.write
        ? "write"
        : "dry-run";
    console.log(`[${milestone}] mode:`, modeLabel);

    const report = await runLivePipeline({
      dryRun,
      reportOnly: flags.reportOnly,
      correlationId: `m5.3-pipeline-${randomUUID()}`,
    });

    let p3Idempotent = report.validations.p3_idempotent;

    if (flags.idempotencyCheck && !flags.reportOnly) {
      console.log(`[${milestone}] idempotency: second run`);
      const second = await runLivePipeline({
        dryRun,
        reportOnly: false,
        correlationId: `m5.3-pipeline-idem-${randomUUID()}`,
      });
      p3Idempotent =
        second.import.ordersCreated === 0 &&
        second.units.unitsCreated === 0 &&
        second.commercial.allocationsCreated === 0 &&
        second.mp.allocationsEnriched === 0 &&
        second.stock.movementsCreated === 0;
      report.validations.p3_idempotent = p3Idempotent;
      if (!p3Idempotent) {
        report.errors.push("P-3 idempotency check failed on second run");
        report.success = false;
      }
    } else if (flags.idempotencyCheck && p3Idempotent === false) {
      report.errors.push("P-3 idempotency check failed");
      report.success = false;
    }

    const recommendation = evaluatePipelineGo(report);

    const output = {
      generatedAt: new Date().toISOString(),
      ...report,
      recommendation,
      pass: report.success,
    };

    fs.mkdirSync(WIP, { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(output, null, 2));

    console.log(`[${milestone}] duration:`, `${report.durationMs}ms`);
    console.log(`[${milestone}] import:`, {
      status: report.import.status,
      fetched: report.import.fetched,
      created: report.import.ordersCreated,
      updated: report.import.ordersUpdated,
      ms: report.import.durationMs,
    });
    console.log(`[${milestone}] units:`, {
      status: report.units.status,
      created: report.units.unitsCreated,
      ms: report.units.durationMs,
    });
    console.log(`[${milestone}] commercial:`, {
      status: report.commercial.status,
      allocations: report.commercial.allocationsCreated,
      ms: report.commercial.durationMs,
    });
    console.log(`[${milestone}] mp:`, {
      status: report.mp.status,
      enriched: report.mp.allocationsEnriched,
      ms: report.mp.durationMs,
    });
    console.log(`[${milestone}] stock:`, {
      status: report.stock.status,
      movements: report.stock.movementsCreated,
      ms: report.stock.durationMs,
    });
    console.log(`[${milestone}] projection:`, {
      status: report.projection.status,
      vI4: report.projection.vI4,
      snapshot: report.projection.snapshotQtyTotal,
      delta: report.projection.movementDeltaTotal,
      projected: report.projection.projectedQtyTotal,
      ms: report.projection.durationMs,
    });
    console.log(`[${milestone}] validations:`, report.validations);
    if (report.failedStage) {
      console.log(`[${milestone}] failed stage:`, report.failedStage);
    }
    if (report.warnings.length) {
      console.log(`[${milestone}] warnings:`, report.warnings);
    }
    if (report.errors.length) {
      console.log(`[${milestone}] errors:`, report.errors);
    }
    console.log(`[${milestone}] report:`, REPORT_PATH);
    console.log(`[${milestone}] recommendation:`, recommendation);

    if (!output.pass) process.exitCode = 1;
  } finally {
    await disconnectPrisma(db);
  }
}

main().catch((err) => {
  console.error("[M5.3] fatal:", err);
  process.exit(1);
});
