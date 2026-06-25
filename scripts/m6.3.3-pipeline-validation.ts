/**
 * M6.3.3 — Validación pipeline + payments pending health
 *
 *   npm run m6.3.3:pipeline:validate
 *   ERP_V2_DB_WRITE=true npm run m6.3.3:pipeline:validate -- --run-pipeline
 */
import fs from "fs";
import path from "path";

import { runLivePipeline } from "../services/erp-v2-live-pipeline";
import { getPaymentsPendingSnapshot } from "../lib/erp/v2/payments-pending-health";
import { listPendingMpPaymentSyncOrderIds } from "../services/erp-v2-payments-sync-live";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { loadEnvLocal } = require("./lib/l0-env.mjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createPrisma, disconnectPrisma } = require("./lib/l1-prisma.mjs");

loadEnvLocal();

// Optional: vercel env pull .env.recovery.local (MP token for local write runs)
const recoveryEnv = path.join(process.cwd(), ".env.recovery.local");
if (fs.existsSync(recoveryEnv)) {
  for (const line of fs.readFileSync(recoveryEnv, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]?.trim()) {
      process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

const WIP = path.join(process.cwd(), "_wip");
const REPORT_PATH = path.join(WIP, "m6.3.3-pipeline-validation-report.json");

async function collectMetrics(prisma: ReturnType<typeof createPrisma>["prisma"]) {
  const [pending, payStats, mpUnits, fiMp] = await Promise.all([
    listPendingMpPaymentSyncOrderIds(500),
    prisma.$queryRaw<[{ total: number; linked_mp: number }]>`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (
          WHERE tn_order_id IS NOT NULL AND source = 'mp_api_sync_staging'
        )::int AS linked_mp
      FROM payments
    `,
    prisma.$queryRaw<[{ units: number; mp_sum: string | null }]>`
      SELECT
        COUNT(*) FILTER (WHERE COALESCE(mp_total_cost_allocated_real,0) > 0)::int AS units,
        SUM(COALESCE(mp_total_cost_allocated_real,0)) AS mp_sum
      FROM tn_order_item_allocations
    `,
    prisma.$queryRaw<[{ rows: number; mp_sum: string | null }]>`
      SELECT
        COUNT(*) FILTER (WHERE mp_fee_allocated > 0)::int AS rows,
        SUM(mp_fee_allocated) AS mp_sum
      FROM financial_items WHERE origin_type = 'TN_ORDER'
    `,
  ]);

  return {
    ordersWithoutPayment: pending.length,
    totalPayments: payStats[0]?.total ?? 0,
    mpAllocUnits: mpUnits[0]?.units ?? 0,
    mpAllocSum: Number(mpUnits[0]?.mp_sum ?? 0),
    fiMpRows: fiMp[0]?.rows ?? 0,
    fiMpSum: Number(fiMp[0]?.mp_sum ?? 0),
  };
}

async function main() {
  const runPipeline = process.argv.includes("--run-pipeline");
  const write = process.argv.includes("--write");

  if (!(process.env.DATABASE_URL ?? "").includes("neon.tech")) {
    throw new Error("DATABASE_URL Neon staging required");
  }

  const client = createPrisma();
  const { prisma } = client;

  try {
    const before = await collectMetrics(prisma);
    const pendingHealthBefore = await getPaymentsPendingSnapshot();

    let pipelineReport = null;
    if (runPipeline) {
      pipelineReport = await runLivePipeline({ dryRun: !write });
    }

    const after = await collectMetrics(prisma);
    const pendingHealthAfter = await getPaymentsPendingSnapshot();

    const report = {
      generatedAt: new Date().toISOString(),
      mode: runPipeline ? (write ? "pipeline-write" : "pipeline-dry-run") : "metrics-only",
      before,
      after,
      comparison: {
        ordersWithoutPayment: {
          before: before.ordersWithoutPayment,
          after: after.ordersWithoutPayment,
          delta: after.ordersWithoutPayment - before.ordersWithoutPayment,
        },
        totalPayments: {
          before: before.totalPayments,
          after: after.totalPayments,
          delta: after.totalPayments - before.totalPayments,
        },
        mpAllocUnits: {
          before: before.mpAllocUnits,
          after: after.mpAllocUnits,
          delta: after.mpAllocUnits - before.mpAllocUnits,
        },
        fiMpRows: {
          before: before.fiMpRows,
          after: after.fiMpRows,
          delta: after.fiMpRows - before.fiMpRows,
        },
      },
      paymentsPending: {
        before: pendingHealthBefore,
        after: pendingHealthAfter,
      },
      pipeline: pipelineReport
        ? {
            success: pipelineReport.success,
            milestone: pipelineReport.milestone,
            payments: pipelineReport.payments,
            mp: pipelineReport.mp,
            financialItems: pipelineReport.financialItems,
          }
        : null,
      pass:
        pendingHealthAfter.status === "PASS" &&
        (!pipelineReport || pipelineReport.success),
    };

    fs.mkdirSync(WIP, { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    console.log(`[M6.3.3] report → ${REPORT_PATH}`);

    if (!report.pass) process.exitCode = 1;
  } finally {
    await disconnectPrisma(client);
  }
}

main().catch((err) => {
  console.error("[M6.3.3] fatal:", err);
  process.exit(1);
});
