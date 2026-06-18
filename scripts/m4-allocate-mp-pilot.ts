/**
 * M4.2c — Pilot prorrateo MP TN-first (25 órdenes con payment)
 */
import fs from "fs";
import path from "path";

import {
  allocateTnOrdersMpBatch,
  auditPaymentsModel,
  listMpEligibleOrderIds,
  measureMpCoverage,
  summarizeMpValidationFailures,
} from "../services/erp-v2-allocations-mp";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { loadEnvLocal } = require("./lib/l0-env.mjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createPrisma, disconnectPrisma } = require("./lib/l1-prisma.mjs");

const PILOT_SIZE = 25;
const WIP = path.join(process.cwd(), "_wip");

loadEnvLocal();

function requireEnv() {
  const missing: string[] = [];
  if (process.env.ERP_V2_DB_WRITE !== "true") missing.push("ERP_V2_DB_WRITE=true");
  if (!(process.env.DATABASE_URL ?? "").includes("neon.tech")) {
    missing.push("DATABASE_URL (Neon staging)");
  }
  if (missing.length) throw new Error(`Pilot env missing: ${missing.join(", ")}`);
}

async function main() {
  requireEnv();
  const db = createPrisma();

  try {
    const paymentsAudit = await auditPaymentsModel();
    console.log("[M4.2c pilot] payments audit:", paymentsAudit);

    const eligible = await listMpEligibleOrderIds();
    const pilotIds = eligible.slice(0, PILOT_SIZE);
    if (!pilotIds.length) {
      throw new Error("sin órdenes elegibles (payment + units)");
    }

    console.log("[M4.2c pilot] eligible:", eligible.length, "pilot:", pilotIds.length);
    console.log("[M4.2c pilot] ids:", pilotIds);

    const dryResults = await allocateTnOrdersMpBatch(pilotIds, {
      dryRun: true,
      ensureCommercial: true,
    });
    const dryFailed = dryResults.filter((r) => !r.ok).length;
    console.log("[M4.2c pilot] dry-run failed:", dryFailed);
    if (dryFailed > 0) {
      console.log(
        JSON.stringify(
          { failures: summarizeMpValidationFailures(dryResults), dryResults },
          null,
          2
        )
      );
      throw new Error("dry-run MP falló");
    }

    const writeResults = await allocateTnOrdersMpBatch(pilotIds, {
      dryRun: false,
      ensureCommercial: true,
    });
    const writeFailed = writeResults.filter((r) => !r.ok).length;
    const units = writeResults
      .filter((r) => r.ok)
      .reduce((a, r) => a + (r.ok ? r.unitCount : 0), 0);
    console.log("[M4.2c pilot] write failed:", writeFailed, "units:", units);

    const coverage = await measureMpCoverage();

    const report = {
      generatedAt: new Date().toISOString(),
      milestone: "M4.2c",
      paymentsAudit,
      eligibleOrders: eligible.length,
      pilotSize: pilotIds.length,
      tnOrderIds: pilotIds,
      dryRun: {
        ok: dryFailed === 0,
        failed: dryFailed,
        validationFailures: summarizeMpValidationFailures(dryResults),
      },
      write: {
        ok: writeFailed === 0,
        allocated: writeResults.filter((r) => r.ok).length,
        failed: writeFailed,
        units,
        validationFailures: summarizeMpValidationFailures(writeResults),
      },
      coverage,
      validations: {
        "V-M1": "Σ fee_allocated = mp_fee_total",
        "V-M2": "Σ tax_allocated = mp_tax_total",
        "V-M3": "Σ financing_allocated = mp_financing_cost",
        "V-M4": "Σ neto_prenda_real = mp_neto_real_orden",
      },
      expectedCoverage: {
        note: "TN-only (828) sin payment link; universo MP = 695 órdenes con payment+units",
        fullBackfillTargetOrders: eligible.length,
      },
    };

    fs.mkdirSync(WIP, { recursive: true });
    const outPath = path.join(WIP, "m4-allocate-mp-pilot.json");
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log("[M4.2c pilot] report:", outPath);
    console.log("[M4.2c pilot] coverage:", coverage);

    if (writeFailed > 0) process.exitCode = 1;
  } finally {
    await disconnectPrisma(db);
  }
}

main().catch((e: unknown) => {
  console.error("[M4.2c pilot] failed:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
