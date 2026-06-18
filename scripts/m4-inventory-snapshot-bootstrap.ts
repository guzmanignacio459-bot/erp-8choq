/**
 * M4.8c — Bootstrap write STOCK MAESTRO → inventory_snapshot_* + declaración T0
 */
import fs from "fs";
import path from "path";

import { bootstrapInventorySnapshot } from "../services/erp-v2-inventory-snapshot";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { loadEnvLocal } = require("./lib/l0-env.mjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createPrisma, disconnectPrisma } = require("./lib/l1-prisma.mjs");

const WIP = path.join(process.cwd(), "_wip");
const REPORT_PATH = path.join(WIP, "m4-inventory-snapshot-bootstrap.json");

loadEnvLocal();

function requireEnv() {
  const missing: string[] = [];
  if (process.env.ERP_V2_DB_WRITE !== "true") missing.push("ERP_V2_DB_WRITE=true");
  if (!(process.env.DATABASE_URL ?? "").includes("neon.tech")) {
    missing.push("DATABASE_URL (Neon staging)");
  }
  if (missing.length) throw new Error(`Bootstrap env missing: ${missing.join(", ")}`);
}

async function main() {
  requireEnv();

  const milestone = "M4.8c";
  const snapshotDate = process.env.M4_8_SNAPSHOT_T0
    ? new Date(process.env.M4_8_SNAPSHOT_T0)
    : new Date();

  console.log(`[${milestone}] inventory snapshot bootstrap write`);
  console.log(`[${milestone}] T0:`, snapshotDate.toISOString());

  const result = await bootstrapInventorySnapshot({
    snapshotDate,
    importedBy: "m4-inventory-snapshot-bootstrap",
    dryRun: false,
  });

  const suspiciousTop = result.topQuantities.filter((r) => r.suspicious);

  const report = {
    generatedAt: new Date().toISOString(),
    milestone,
    dryRun: false,
    t0: {
      snapshotDate: result.snapshotDate,
      runId: result.runId,
      label: result.label,
      rowCount: result.rowCount,
      checksumSha256: result.checksumSha256,
      source: "stock_maestro_bootstrap",
      declaration: result.t0Declaration,
    },
    stats: result.draft.stats,
    preWriteValidation: result.preWriteValidation,
    postWriteValidation: result.postWriteValidation,
    topQuantities: result.topQuantities,
    suspiciousQuantityCount: suspiciousTop.length,
    warnings: result.draft.warnings,
    exclusionsCount: result.draft.exclusions.length,
  };

  if (!fs.existsSync(WIP)) fs.mkdirSync(WIP, { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

  console.log(`[${milestone}] runId:`, result.runId);
  console.log(`[${milestone}] rowCount:`, result.rowCount);
  console.log(`[${milestone}] checksum:`, result.checksumSha256);
  console.log(`[${milestone}] V-I1:`, result.postWriteValidation?.vI1.pass ? "PASS" : "FAIL");
  console.log(`[${milestone}] V-I2:`, result.postWriteValidation?.vI2.pass ? "PASS" : "FAIL");
  console.log(`[${milestone}] V-I3:`, result.postWriteValidation?.vI3.pass ? "PASS" : "FAIL");
  console.log(`[${milestone}] V-I4:`, result.postWriteValidation?.vI4.pass ? "PASS" : "FAIL");
  console.log(`[${milestone}] suspicious top qty:`, suspiciousTop.length);
  console.log(`[${milestone}] report:`, REPORT_PATH);

  const db = createPrisma();
  await disconnectPrisma(db);
}

main().catch((err) => {
  console.error("[M4.8c] fatal:", err);
  process.exit(1);
});
