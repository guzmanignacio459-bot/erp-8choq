/**
 * M6.5.1 — Backfill assignments para órdenes TN transferencia
 *
 *   npm run m6.5.1:assignments:backfill
 *   ERP_V2_DB_WRITE=true npm run m6.5.1:assignments:backfill -- --write
 *   ERP_V2_DB_WRITE=true npm run m6.5.1:assignments:backfill -- --write --seed-accounts
 */
import fs from "fs";
import path from "path";

import {
  assignAllTnTransferOrders,
  fetchTransferAssignmentKpi,
  seedDemoFinancialAccounts,
} from "../services/erp-v2-financial-account-assignments";
import { getTransferAssignmentsPendingSnapshot } from "../lib/erp/v2/transfer-assignments-pending-health";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { loadEnvLocal } = require("./lib/l0-env.mjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createPrisma, disconnectPrisma } = require("./lib/l1-prisma.mjs");

loadEnvLocal();

const WIP = path.join(process.cwd(), "_wip");
const REPORT_PATH = path.join(WIP, "m6.5.1-assignments-backfill-report.json");

async function main() {
  const write = process.argv.includes("--write");
  const seedAccounts = process.argv.includes("--seed-accounts");

  if (!(process.env.DATABASE_URL ?? "").includes("neon.tech")) {
    throw new Error("DATABASE_URL Neon staging required");
  }

  const client = createPrisma();

  try {
    if (write && seedAccounts) {
      await seedDemoFinancialAccounts();
    }

    const kpiBefore = await fetchTransferAssignmentKpi();
    const healthBefore = await getTransferAssignmentsPendingSnapshot();

    const result = await assignAllTnTransferOrders({ dryRun: !write });

    const kpiAfter = await fetchTransferAssignmentKpi();
    const healthAfter = await getTransferAssignmentsPendingSnapshot();

    const report = {
      generatedAt: new Date().toISOString(),
      mode: write ? "write" : "dry-run",
      seedAccounts: write && seedAccounts,
      before: { kpi: kpiBefore, health: healthBefore },
      backfill: result,
      after: { kpi: kpiAfter, health: healthAfter },
      pass:
        result.unresolved === 0 &&
        kpiAfter.transferUnassigned === 0 &&
        healthAfter.status === "PASS",
    };

    fs.mkdirSync(WIP, { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    console.log(`[M6.5.1] report → ${REPORT_PATH}`);

    if (!report.pass && write) process.exitCode = 1;
  } finally {
    await disconnectPrisma(client);
  }
}

main().catch((err) => {
  console.error("[M6.5.1] fatal:", err);
  process.exit(1);
});
