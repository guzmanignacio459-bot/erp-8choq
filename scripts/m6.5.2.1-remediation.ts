/**
 * M6.5.2.1 — Remediación histórica transferencias sin FI
 *
 *   npm run m6.5.2.1:remediation
 *   ERP_V2_DB_WRITE=true npm run m6.5.2.1:remediation -- --write
 */
import fs from "fs";
import path from "path";

import { computeTransferFeeOrder } from "../lib/financial-items/transfer-fee-allocation";
import { applyTransferFeeForTnOrder } from "../services/financial-items/apply-transfer-fee";
import { generateFinancialItemsFromTn } from "../services/financial-items/generate-from-tn";
import { allocateTnOrdersCommercialBackfill } from "../services/erp-v2-allocations-commercial";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { loadEnvLocal } = require("./lib/l0-env.mjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createPrisma, disconnectPrisma } = require("./lib/l1-prisma.mjs");

loadEnvLocal();

const WIP = path.join(process.cwd(), "_wip");
const REPORT_PATH = path.join(WIP, "m6.5.2.1-remediation-report.json");

const HISTORICAL_10 = [
  "1946366090",
  "1946655544",
  "1955970533",
  "1956962379",
  "1957874696",
  "1958000123",
  "1958213922",
  "1971353447",
  "1971717736",
  "1971827417",
];

const JUNE_25 = ["2003745339", "2003751915"];

const ALL_12 = [...HISTORICAL_10, ...JUNE_25];

type TransferAudit = {
  transfers: number;
  withAssignment: number;
  withFi: number;
  withoutFi: number;
  withTransferFee: number;
};

async function auditTransfers(prisma: ReturnType<typeof createPrisma>["prisma"]): Promise<TransferAudit> {
  const row = await prisma.$queryRaw<
    Array<{
      transfers: number;
      with_assignment: number;
      with_fi: number;
      without_fi: number;
      with_transfer_fee: number;
    }>
  >`
    SELECT
      COUNT(DISTINCT a.origin_id)::int AS transfers,
      COUNT(DISTINCT a.origin_id)::int AS with_assignment,
      COUNT(DISTINCT CASE WHEN fi.cnt > 0 THEN a.origin_id END)::int AS with_fi,
      COUNT(DISTINCT CASE WHEN COALESCE(fi.cnt, 0) = 0 THEN a.origin_id END)::int AS without_fi,
      COUNT(DISTINCT CASE WHEN fi.fee_sum > 0 THEN a.origin_id END)::int AS with_transfer_fee
    FROM financial_account_assignments a
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::int AS cnt,
        SUM(transfer_fee_allocated)::float AS fee_sum
      FROM financial_items fi
      WHERE fi.origin_type = 'TN_ORDER' AND fi.origin_id = a.origin_id
    ) fi ON true
    WHERE a.origin_type = 'TN_ORDER'
  `;

  const r = row[0]!;
  return {
    transfers: r.transfers,
    withAssignment: r.with_assignment,
    withFi: r.with_fi,
    withoutFi: r.without_fi,
    withTransferFee: r.with_transfer_fee,
  };
}

async function orderStatus(
  prisma: ReturnType<typeof createPrisma>["prisma"],
  tnOrderId: string
) {
  const row = await prisma.$queryRaw<
    Array<{
      commercial: number;
      fi: number;
      transfer_fee: string;
      rate: string;
      tn_total: string;
    }>
  >`
    SELECT
      (SELECT COUNT(*)::int FROM tn_order_item_allocations WHERE tn_order_id = ${tnOrderId}) AS commercial,
      (SELECT COUNT(*)::int FROM financial_items WHERE origin_type = 'TN_ORDER' AND origin_id = ${tnOrderId}) AS fi,
      COALESCE((
        SELECT SUM(transfer_fee_allocated)::text
        FROM financial_items WHERE origin_type = 'TN_ORDER' AND origin_id = ${tnOrderId}
      ), '0') AS transfer_fee,
      a.rate_percent_snapshot::text AS rate,
      o.tn_total::text AS tn_total
    FROM tn_orders o
    INNER JOIN financial_account_assignments a
      ON a.origin_type = 'TN_ORDER' AND a.origin_id = o.id
    WHERE o.id = ${tnOrderId}
  `;
  const r = row[0];
  if (!r) return null;
  const expected = computeTransferFeeOrder(Number(r.tn_total), Number(r.rate));
  const actual = Number(r.transfer_fee);
  return {
    commercial: r.commercial > 0,
    fi: r.fi > 0,
    fiCount: r.fi,
    transferFee: actual,
    transferFeeOk: Math.abs(expected - actual) <= 0.01,
  };
}

async function main() {
  const write = process.argv.includes("--write");

  if (!(process.env.DATABASE_URL ?? "").includes("neon.tech")) {
    throw new Error("DATABASE_URL Neon staging required");
  }

  const client = createPrisma();
  const { prisma } = client;

  try {
    const before = await auditTransfers(prisma);

    const historicalResults: Array<{
      tnOrderId: string;
      commercial: boolean;
      fi: boolean;
      transferFee: boolean;
    }> = [];

    const june25Results: Array<{
      tnOrderId: string;
      fiCreated: number;
      transferFee: number;
    }> = [];

    if (write) {
      const commercialBatch = await allocateTnOrdersCommercialBackfill(
        HISTORICAL_10,
        { dryRun: false }
      );
      const commercialFailed = commercialBatch.filter((r) => !r.ok);
      if (commercialFailed.length) {
        throw new Error(
          `Commercial backfill failed: ${commercialFailed.map((r) => (!r.ok ? r.tnOrderId : "")).join(", ")}`
        );
      }

      for (const tnOrderId of ALL_12) {
        const fi = await generateFinancialItemsFromTn({
          tnOrderId,
          dryRun: false,
        });
        if (JUNE_25.includes(tnOrderId)) {
          june25Results.push({
            tnOrderId,
            fiCreated: fi.created,
            transferFee: 0,
          });
        }
        await applyTransferFeeForTnOrder(tnOrderId, { dryRun: false });
      }
    }

    for (const tnOrderId of HISTORICAL_10) {
      const s = await orderStatus(prisma, tnOrderId);
      historicalResults.push({
        tnOrderId,
        commercial: s?.commercial ?? false,
        fi: s?.fi ?? false,
        transferFee: s?.transferFeeOk ?? false,
      });
    }

    for (const entry of june25Results.length ? june25Results : JUNE_25.map((id) => ({ tnOrderId: id, fiCreated: 0, transferFee: 0 }))) {
      const s = await orderStatus(prisma, entry.tnOrderId);
      if (write) {
        entry.fiCreated = s?.fiCount ?? 0;
        entry.transferFee = s?.transferFee ?? 0;
      } else {
        entry.fiCreated = s?.fiCount ?? 0;
        entry.transferFee = s?.transferFee ?? 0;
      }
    }

    const after = await auditTransfers(prisma);

    const report = {
      generatedAt: new Date().toISOString(),
      mode: write ? "write" : "dry-run",
      before,
      after,
      historical10: historicalResults,
      june25: june25Results.length
        ? june25Results
        : await Promise.all(
            JUNE_25.map(async (tnOrderId) => {
              const s = await orderStatus(prisma, tnOrderId);
              return {
                tnOrderId,
                fiCreated: s?.fiCount ?? 0,
                transferFee: s?.transferFee ?? 0,
              };
            })
          ),
      pass:
        historicalResults.every((r) => r.commercial && r.fi && r.transferFee) &&
        (write
          ? after.withoutFi === 0 && after.withFi === 43
          : before.withoutFi === 12),
    };

    fs.mkdirSync(WIP, { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    console.log(`[M6.5.2.1] report → ${REPORT_PATH}`);

    if (write && !report.pass) process.exitCode = 1;
  } finally {
    await disconnectPrisma(client);
  }
}

main().catch((err) => {
  console.error("[M6.5.2.1] fatal:", err);
  process.exit(1);
});
