/**
 * M4.8d — Inventory projection verify (read-only)
 */
import fs from "fs";
import path from "path";

import { validateInventoryProjection } from "../lib/erp/v2/validate-inventory-projection";
import { loadProjectionValidationInputs } from "../services/erp-v2-inventory-projection";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { loadEnvLocal } = require("./lib/l0-env.mjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createPrisma, disconnectPrisma } = require("./lib/l1-prisma.mjs");

const WIP = path.join(process.cwd(), "_wip");
const REPORT_PATH = path.join(WIP, "m4-inventory-projection-verify.json");

loadEnvLocal();

function requireEnv() {
  const missing: string[] = [];
  if (!(process.env.DATABASE_URL ?? "").includes("neon.tech")) {
    missing.push("DATABASE_URL (Neon staging)");
  }
  if (missing.length) throw new Error(`Verify env missing: ${missing.join(", ")}`);
}

async function main() {
  requireEnv();

  const milestone = "M4.8d";
  const generatedAt = new Date().toISOString();

  console.log(`[${milestone}] inventory projection verify (read-only)`);

  const inputs = await loadProjectionValidationInputs();
  const validation = validateInventoryProjection({
    snapshotLines: inputs.snapshotLines,
    movements: inputs.movements,
    projectionRows: inputs.rows,
    movementsPostT0: inputs.movementsPostT0,
  });

  const report = {
    generatedAt,
    milestone,
    mode: "read-only-verify",
    writes: false,
    snapshot: inputs.snapshot,
    movementsPostT0: inputs.movementsPostT0,
    projectionRowCount: inputs.rows.length,
    totals: inputs.totals,
    validation,
    sampleRows: inputs.rows.slice(0, 5),
    topProjected: [...inputs.rows]
      .sort((a, b) => b.projectedQty - a.projectedQty)
      .slice(0, 10)
      .map((r) => ({
        sku: r.sku,
        talle: r.talle,
        owner: r.owner,
        snapshotQty: r.snapshotQty,
        netDelta: r.netDelta,
        projectedQty: r.projectedQty,
      })),
  };

  if (!fs.existsSync(WIP)) fs.mkdirSync(WIP, { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

  console.log(`[${milestone}] T0:`, inputs.snapshot.snapshotDate);
  console.log(`[${milestone}] runId:`, inputs.snapshot.runId);
  console.log(`[${milestone}] projection rows:`, inputs.rows.length);
  console.log(`[${milestone}] movements post-T0:`, inputs.movementsPostT0);
  console.log(`[${milestone}] snapshot qty total:`, inputs.totals.snapshotQuantityTotal);
  console.log(`[${milestone}] net delta total:`, inputs.totals.netDeltaTotal);
  console.log(`[${milestone}] projected qty total:`, inputs.totals.projectedQuantityTotal);
  console.log(`[${milestone}] V-I3:`, validation.vI3.pass ? "PASS" : "FAIL");
  console.log(`[${milestone}] V-I4:`, validation.vI4.pass ? "PASS" : "FAIL");
  console.log(`[${milestone}] V-I5:`, validation.vI5.pass ? "PASS" : "FAIL");
  console.log(`[${milestone}] V-I6:`, validation.vI6.pass ? "PASS" : "FAIL");
  console.log(`[${milestone}] report:`, REPORT_PATH);

  const db = createPrisma();
  await disconnectPrisma(db);

  if (!validation.allPass) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("[M4.8d] fatal:", err);
  process.exit(1);
});
