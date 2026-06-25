/**
 * M6.5.2 — Audit transfer fee parity per order (tolerance 0.01)
 *
 *   npm run m6.5.2:transfer-fee:audit
 */
import fs from "fs";
import path from "path";

import { computeTransferFeeOrder } from "../lib/financial-items/transfer-fee-allocation";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { loadEnvLocal } = require("./lib/l0-env.mjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createPrisma, disconnectPrisma } = require("./lib/l1-prisma.mjs");

loadEnvLocal();

const WIP = path.join(process.cwd(), "_wip");
const REPORT_PATH = path.join(WIP, "m6.5.2-transfer-fee-audit-report.json");
const TOLERANCE = 0.01;

async function main() {
  if (!(process.env.DATABASE_URL ?? "").includes("neon.tech")) {
    throw new Error("DATABASE_URL Neon staging required");
  }

  const client = createPrisma();
  const { prisma } = client;

  try {
    const rows = await prisma.$queryRaw<
      Array<{
        origin_id: string;
        tn_total: string;
        rate_percent_snapshot: string;
        fi_sum: string;
        fi_count: number;
      }>
    >`
      SELECT
        a.origin_id,
        o.tn_total::text,
        a.rate_percent_snapshot::text,
        COALESCE(SUM(fi.transfer_fee_allocated), 0)::text AS fi_sum,
        COUNT(fi.id)::int AS fi_count
      FROM financial_account_assignments a
      INNER JOIN tn_orders o ON o.id = a.origin_id
      LEFT JOIN financial_items fi
        ON fi.origin_type = 'TN_ORDER' AND fi.origin_id = a.origin_id
      WHERE a.origin_type = 'TN_ORDER'
      GROUP BY a.origin_id, o.tn_total, a.rate_percent_snapshot
      ORDER BY a.origin_id
    `;

    const failures: Array<{
      orderId: string;
      expected: number;
      actual: number;
      delta: number;
    }> = [];

    const ordersWithoutFi: string[] = [];
    let transferFeeTotal = 0;
    let ordersWithFi = 0;

    for (const row of rows) {
      const expected = computeTransferFeeOrder(
        Number(row.tn_total),
        Number(row.rate_percent_snapshot)
      );
      const actual = Number(row.fi_sum);
      transferFeeTotal += actual;

      if (row.fi_count === 0) {
        ordersWithoutFi.push(row.origin_id);
        continue;
      }

      ordersWithFi++;
      const delta = Math.abs(expected - actual);
      if (delta > TOLERANCE) {
        failures.push({
          orderId: row.origin_id,
          expected,
          actual,
          delta,
        });
      }
    }

    const report = {
      generatedAt: new Date().toISOString(),
      ordersChecked: rows.length,
      ordersWithFi,
      ordersWithoutFi: ordersWithoutFi.length,
      ordersWithoutFiIds: ordersWithoutFi,
      transferFeeTotal,
      tolerance: TOLERANCE,
      failures,
      pass: failures.length === 0,
    };

    fs.mkdirSync(WIP, { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    console.log(`[M6.5.2] audit → ${REPORT_PATH}`);

    if (!report.pass) process.exitCode = 1;
  } finally {
    await disconnectPrisma(client);
  }
}

main().catch((err) => {
  console.error("[M6.5.2] audit fatal:", err);
  process.exit(1);
});
