/**
 * M4.5d — Normalizar grain SKU en stock_movements post-T0 (paridad snapshot T0)
 */
import fs from "fs";
import path from "path";

import { validateInventoryProjection } from "../lib/erp/v2/validate-inventory-projection";
import { loadProjectionValidationInputs } from "../services/erp-v2-inventory-projection";
import {
  auditPostT0StockMovementGrain,
  loadActiveSnapshotDate,
  measureTnOnlyStockCoverage,
  normalizePostT0StockMovements,
} from "../services/erp-v2-stock-ledger";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { loadEnvLocal } = require("./lib/l0-env.mjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createPrisma, disconnectPrisma } = require("./lib/l1-prisma.mjs");

const WIP = path.join(process.cwd(), "_wip");
const REPORT_PATH = path.join(WIP, "m4-stock-ledger-normalize-grain.json");

loadEnvLocal();

function requireEnv(write: boolean) {
  const missing: string[] = [];
  if (write && process.env.ERP_V2_DB_WRITE !== "true") {
    missing.push("ERP_V2_DB_WRITE=true");
  }
  if (!(process.env.DATABASE_URL ?? "").includes("neon.tech")) {
    missing.push("DATABASE_URL (Neon staging)");
  }
  if (missing.length) throw new Error(`Env missing: ${missing.join(", ")}`);
}

async function main() {
  const write = process.argv.includes("--write");
  requireEnv(write);

  const milestone = "M4.5d";
  const db = createPrisma();

  try {
    const snapshotDate = await loadActiveSnapshotDate();
    console.log(`[${milestone}] T0:`, snapshotDate.toISOString());
    console.log(`[${milestone}] mode:`, write ? "write" : "dry-run");

    const preAudit = await auditPostT0StockMovementGrain(snapshotDate);
    console.log(`[${milestone}] pre-audit:`, preAudit);

    const result = await normalizePostT0StockMovements({
      dryRun: !write,
      snapshotDate,
    });
    console.log(`[${milestone}] normalize:`, {
      scanned: result.scanned,
      updated: result.updated,
      unchanged: result.unchanged,
    });

    let projectionReport: Record<string, unknown> | null = null;
    if (write) {
      const inputs = await loadProjectionValidationInputs();
      const validation = validateInventoryProjection({
        snapshotLines: inputs.snapshotLines,
        movements: inputs.movements,
        projectionRows: inputs.rows,
        movementsPostT0: inputs.movementsPostT0,
      });
      const coverage = await measureTnOnlyStockCoverage(snapshotDate);

      projectionReport = {
        movementsPostT0: inputs.movementsPostT0,
        projectionRowCount: inputs.rows.length,
        totals: inputs.totals,
        coverage,
        validation,
        negativeQtyVariants: inputs.rows.filter((r) => r.projectedQty < 0).length,
        orphanMovementRows: inputs.rows.filter(
          (r) => r.snapshotQty === 0 && r.netDelta !== 0
        ).length,
      };
      console.log(`[${milestone}] projection rows:`, inputs.rows.length);
      console.log(`[${milestone}] negative qty variants:`, projectionReport.negativeQtyVariants);
      console.log(`[${milestone}] orphan rows:`, projectionReport.orphanMovementRows);
      console.log(`[${milestone}] V-I4:`, validation.vI4.pass ? "PASS" : "FAIL");
    }

    const postAudit = write
      ? await auditPostT0StockMovementGrain(snapshotDate)
      : preAudit;

    const report = {
      generatedAt: new Date().toISOString(),
      milestone,
      mode: write ? "write" : "dry-run",
      t0: snapshotDate.toISOString(),
      preAudit,
      normalize: result,
      postAudit,
      projection: projectionReport,
      pass: write
        ? (postAudit.needsNormalization === 0 &&
            (projectionReport?.negativeQtyVariants as number) === 0 &&
            (projectionReport?.orphanMovementRows as number) === 0)
        : preAudit.needsNormalization > 0,
    };

    fs.mkdirSync(WIP, { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    console.log(`[${milestone}] report:`, REPORT_PATH);

    if (write && !report.pass) process.exitCode = 1;
  } finally {
    await disconnectPrisma(db);
  }
}

main().catch((err) => {
  console.error("[M4.5d] fatal:", err);
  process.exit(1);
});
