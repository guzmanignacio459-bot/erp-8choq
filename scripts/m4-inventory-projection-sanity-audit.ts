/**
 * M4.9 — Inventory Projection Sanity Audit (read-only)
 */
import fs from "fs";
import path from "path";

import { buildInventoryProjectionSanityReport } from "../lib/erp/v2/audit-inventory-projection-sanity";
import { getPrisma } from "../lib/db/prisma";
import { loadProjectionValidationInputs } from "../services/erp-v2-inventory-projection";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { loadEnvLocal } = require("./lib/l0-env.mjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createPrisma, disconnectPrisma } = require("./lib/l1-prisma.mjs");

const WIP = path.join(process.cwd(), "_wip");
const REPORT_PATH = path.join(WIP, "m4-inventory-projection-sanity-audit.json");

loadEnvLocal();

function requireEnv() {
  if (!(process.env.DATABASE_URL ?? "").includes("neon.tech")) {
    throw new Error("DATABASE_URL (Neon staging) required");
  }
}

async function main() {
  requireEnv();
  const milestone = "M4.9";
  const db = createPrisma();

  try {
    console.log(`[${milestone}] inventory projection sanity audit (read-only)`);

    const inputs = await loadProjectionValidationInputs();
    const activeRunCount = await getPrisma().inventorySnapshotRun.count({
      where: { isActive: true, source: "stock_maestro_bootstrap" },
    });

    const report = buildInventoryProjectionSanityReport({
      snapshot: inputs.snapshot,
      activeRunCount,
      snapshotLines: inputs.snapshotLines,
      movements: inputs.movements,
      rows: inputs.rows,
    });

    fs.mkdirSync(WIP, { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

    console.log(`[${milestone}] projection rows:`, report.executiveSummary.projectionRowCount);
    console.log(`[${milestone}] snapshot qty:`, report.executiveSummary.snapshotQtyTotal);
    console.log(`[${milestone}] net delta:`, report.executiveSummary.movementDeltaTotal);
    console.log(`[${milestone}] projected qty:`, report.executiveSummary.projectedQtyTotal);
    console.log(`[${milestone}] checksum match:`, report.snapshotValidation.checksumMatch);
    console.log(`[${milestone}] formula pass:`, report.executiveSummary.projectionFormulaPass);
    console.log(`[${milestone}] blockers:`, report.executiveSummary.blockerCount);
    console.log(`[${milestone}] warnings:`, report.executiveSummary.warningCount);
    console.log(`[${milestone}] M5:`, report.executiveSummary.m5Recommendation);
    console.log(`[${milestone}] top anomaly:`, report.topProjected[0]);
    console.log(`[${milestone}] report:`, REPORT_PATH);

    if (report.executiveSummary.m5Recommendation === "NO_GO") {
      process.exitCode = 1;
    }
  } finally {
    await disconnectPrisma(db);
  }
}

main().catch((err) => {
  console.error("[M4.9] fatal:", err);
  process.exit(1);
});
