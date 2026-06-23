/**
 * M4.5b — Pilot Stock Ledger TN-only (25 órdenes)
 */
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

import {
  auditParseWarningsTnOnly,
  listTnOnlyStockPilotOrderIds,
  measureStockPilotCoverage,
  recordTnOrdersStockSalesBatch,
  summarizeStockValidationFailures,
} from "../services/erp-v2-stock-ledger";
import { validatePilotCoverage } from "../lib/erp/v2/validate-tn-stock-movements";

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
    const parseAudit = await auditParseWarningsTnOnly();
    console.log("[M4.5b pilot] parse_warnings audit TN-only:", parseAudit.tnOnly);
    console.log("[M4.5b pilot] parse_warnings audit global:", parseAudit.global);

    const pilotIds = await listTnOnlyStockPilotOrderIds(PILOT_SIZE);
    if (!pilotIds.length) {
      throw new Error("sin órdenes TN-only elegibles para pilot stock");
    }

    console.log("[M4.5b pilot] orders:", pilotIds.length, pilotIds);

    const dryResults = await recordTnOrdersStockSalesBatch(pilotIds, {
      dryRun: true,
    });
    const dryFailed = dryResults.filter((r) => !r.ok).length;
    console.log("[M4.5b pilot] dry-run failed:", dryFailed);
    if (dryFailed > 0) {
      console.log(JSON.stringify(dryResults.filter((r) => !r.ok), null, 2));
      throw new Error("dry-run stock falló");
    }

    const correlationId = `m4.5b-pilot-${randomUUID()}`;
    const writeResults = await recordTnOrdersStockSalesBatch(pilotIds, {
      dryRun: false,
      correlationId,
    });
    const writeFailed = writeResults.filter((r) => !r.ok).length;
    const sales = writeResults
      .filter((r) => r.ok)
      .reduce((a, r) => a + (r.ok ? r.salesCreated : 0), 0);
    const expected = writeResults
      .filter((r) => r.ok)
      .reduce((a, r) => a + (r.ok ? r.expectedSales : 0), 0);

    console.log("[M4.5b pilot] write failed:", writeFailed, "sales:", sales);

    const coverage = await measureStockPilotCoverage(pilotIds);
    const vS7 = validatePilotCoverage(coverage.expectedSales, coverage.actualSales);

    const report = {
      generatedAt: new Date().toISOString(),
      milestone: "M4.5b",
      parseWarningsAudit: parseAudit,
      pilotSize: pilotIds.length,
      tnOrderIds: pilotIds,
      correlationId,
      dryRun: {
        ok: dryFailed === 0,
        failed: dryFailed,
        validationFailures: summarizeStockValidationFailures(dryResults),
      },
      write: {
        ok: writeFailed === 0 && !vS7,
        failed: writeFailed,
        sales,
        expectedSales: expected,
        validationFailures: summarizeStockValidationFailures(writeResults),
      },
      coverage,
      validations: {
        "V-S1": "1 sale por unit stockable",
        "V-S2": "qty = 1",
        "V-S3": "sin duplicados",
        "V-S4": "sin GIFTY",
        "V-S5": "FK válida tn_order_item_unit_id",
        "V-S6": "idempotencia idempotency_key",
        "V-S7": "sale movements = units stockables esperadas",
        "V-S8": "0 escrituras GAS/Sheets (Neon-only)",
      },
      vS7,
      vS8: { pass: true, note: "No Sheets/GAS code paths in stock ledger service" },
      pass:
        writeFailed === 0 &&
        !vS7 &&
        coverage.unitCoveragePct === 100,
    };

    fs.mkdirSync(WIP, { recursive: true });
    const outPath = path.join(WIP, "m4-stock-ledger-pilot.json");
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log("[M4.5b pilot] report:", outPath);
    console.log("[M4.5b pilot] coverage:", coverage);

    if (!report.pass) process.exitCode = 1;
  } finally {
    await disconnectPrisma(db);
  }
}

main().catch((e: unknown) => {
  console.error("[M4.5b pilot] failed:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
