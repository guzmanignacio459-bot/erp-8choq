/**
 * M6.5.2 — Backfill transfer_fee_allocated para órdenes con assignment
 *
 *   npm run m6.5.2:transfer-fee:backfill
 *   ERP_V2_DB_WRITE=true npm run m6.5.2:transfer-fee:backfill -- --write
 */
import fs from "fs";
import path from "path";

import { applyTransferFeeForAllAssignedOrders } from "../services/financial-items/apply-transfer-fee";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { loadEnvLocal } = require("./lib/l0-env.mjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createPrisma, disconnectPrisma } = require("./lib/l1-prisma.mjs");

loadEnvLocal();

const WIP = path.join(process.cwd(), "_wip");
const REPORT_PATH = path.join(WIP, "m6.5.2-transfer-fee-backfill-report.json");

async function main() {
  const write = process.argv.includes("--write");

  if (!(process.env.DATABASE_URL ?? "").includes("neon.tech")) {
    throw new Error("DATABASE_URL Neon staging required");
  }

  const client = createPrisma();
  const { prisma } = client;

  try {
    const beforeAgg = await prisma.financialItem.aggregate({
      where: { originType: "TN_ORDER" },
      _sum: { transferFeeAllocated: true },
      _count: { id: true },
    });

    const result = await applyTransferFeeForAllAssignedOrders({ dryRun: !write });

    const afterAgg = await prisma.financialItem.aggregate({
      where: { originType: "TN_ORDER" },
      _sum: { transferFeeAllocated: true },
    });

    const report = {
      generatedAt: new Date().toISOString(),
      mode: write ? "write" : "dry-run",
      before: {
        fiCount: beforeAgg._count.id,
        transferFeeTotal: Number(beforeAgg._sum.transferFeeAllocated ?? 0),
      },
      backfill: result,
      after: {
        transferFeeTotal: Number(afterAgg._sum.transferFeeAllocated ?? 0),
      },
      pass:
        result.ordersOk > 0 &&
        result.errors.every((e) => e.includes("no financial items")),
    };

    fs.mkdirSync(WIP, { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    console.log(`[M6.5.2] report → ${REPORT_PATH}`);

    if (!report.pass && write) process.exitCode = 1;
  } finally {
    await disconnectPrisma(client);
  }
}

main().catch((err) => {
  console.error("[M6.5.2] fatal:", err);
  process.exit(1);
});
