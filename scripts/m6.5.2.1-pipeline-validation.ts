/**
 * M6.5.2.1 — Validación pipeline FI desde commercial (transferencias)
 *
 *   npm run m6.5.2.1:pipeline:validate
 */
import fs from "fs";
import path from "path";

import { collectFiOrderIdsFromCommercialResults } from "../lib/erp/v2/collect-fi-order-ids";
import { allocatePostT0OrderCommercialLive } from "../services/erp-v2-allocations-commercial-live";
import { runFinancialItemsSyncForOrders } from "../services/erp-v2-financial-items-sync-live";
import type { LiveCommercialAllocateItemResult } from "../services/erp-v2-allocations-commercial-live";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { loadEnvLocal } = require("./lib/l0-env.mjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createPrisma, disconnectPrisma } = require("./lib/l1-prisma.mjs");

loadEnvLocal();

const WIP = path.join(process.cwd(), "_wip");
const REPORT_PATH = path.join(WIP, "m6.5.2.1-pipeline-validation-report.json");

function assertCollectLogic(): { pass: boolean; details: string[] } {
  const details: string[] = [];
  const cases: Array<{
    label: string;
    results: LiveCommercialAllocateItemResult[];
    expect: string[];
  }> = [
    {
      label: "new allocation",
      results: [
        {
          ok: true,
          tnOrderId: "T1",
          unitCount: 2,
          allocationsCreated: 2,
          validation: { passed: true, failures: [], sums: { discount: 0, shipping: 0, grossUnitAmount: 0, netCommercialAmount: 0 }, audit: { tnDiscount: 0, poolDiscountInferred: 0, discountInferenceDelta: 0 } },
        },
      ],
      expect: ["T1"],
    },
    {
      label: "already_allocated",
      results: [
        {
          ok: true,
          tnOrderId: "T2",
          skipped: true,
          skipReason: "already_allocated",
          unitCount: 1,
          allocationsCreated: 0,
          validation: { passed: true, failures: [], sums: { discount: 0, shipping: 0, grossUnitAmount: 0, netCommercialAmount: 0 }, audit: { tnDiscount: 0, poolDiscountInferred: 0, discountInferenceDelta: 0 } },
        },
      ],
      expect: ["T2"],
    },
    {
      label: "cancelled skip",
      results: [
        {
          ok: true,
          tnOrderId: "T3",
          skipped: true,
          skipReason: "cancelled_or_refunded",
          unitCount: 0,
          allocationsCreated: 0,
          validation: { passed: true, failures: [], sums: { discount: 0, shipping: 0, grossUnitAmount: 0, netCommercialAmount: 0 }, audit: { tnDiscount: 0, poolDiscountInferred: 0, discountInferenceDelta: 0 } },
        },
      ],
      expect: [],
    },
  ];

  let pass = true;
  for (const c of cases) {
    const got = collectFiOrderIdsFromCommercialResults(c.results);
    const ok =
      got.length === c.expect.length &&
      c.expect.every((id) => got.includes(id));
    details.push(`${c.label}: ${ok ? "PASS" : `FAIL got=${got.join(",")}`}`);
    if (!ok) pass = false;
  }
  return { pass, details };
}

async function main() {
  if (!(process.env.DATABASE_URL ?? "").includes("neon.tech")) {
    throw new Error("DATABASE_URL Neon staging required");
  }

  const client = createPrisma();
  const { prisma } = client;

  try {
    const logic = assertCollectLogic();

    // End-to-end: transfer con allocations → FI sync (sin MP)
    const sampleOrderId = "2003745339";
    const commercial = await allocatePostT0OrderCommercialLive(sampleOrderId, {
      dryRun: true,
    });
    const fiIds = collectFiOrderIdsFromCommercialResults([commercial]);
    const fiSync = await runFinancialItemsSyncForOrders(
      fiIds.length ? fiIds : [sampleOrderId],
      { dryRun: true }
    );

    const chain = await prisma.$queryRaw<
      Array<{
        tn_order_id: string;
        has_commercial: boolean;
        fi_count: number;
        transfer_fee_sum: string;
      }>
    >`
      SELECT
        o.id AS tn_order_id,
        EXISTS(SELECT 1 FROM tn_order_item_allocations a WHERE a.tn_order_id = o.id) AS has_commercial,
        (SELECT COUNT(*)::int FROM financial_items fi WHERE fi.origin_id = o.id AND fi.origin_type = 'TN_ORDER') AS fi_count,
        COALESCE((
          SELECT SUM(transfer_fee_allocated)::text FROM financial_items fi
          WHERE fi.origin_id = o.id AND fi.origin_type = 'TN_ORDER'
        ), '0') AS transfer_fee_sum
      FROM tn_orders o
      WHERE o.id = ${sampleOrderId}
    `;

    const global = await prisma.$queryRaw<
      Array<{ without_fi: number; total: number }>
    >`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (
          WHERE NOT EXISTS (
            SELECT 1 FROM financial_items fi
            WHERE fi.origin_type = 'TN_ORDER' AND fi.origin_id = a.origin_id
          )
        )::int AS without_fi
      FROM financial_account_assignments a
      WHERE a.origin_type = 'TN_ORDER'
    `;

    const report = {
      generatedAt: new Date().toISOString(),
      collectLogic: logic,
      simulatedTransfer: {
        orderId: sampleOrderId,
        commercialOk: commercial.ok,
        commercialSkipReason:
          commercial.ok && commercial.skipped ? commercial.skipReason : null,
        fiOrderIdsFromCommercial: fiIds,
        fiSyncDryRun: fiSync.stats,
        chain: chain[0] ?? null,
      },
      globalTransfers: global[0] ?? { total: 0, without_fi: 0 },
      pass:
        logic.pass &&
        fiIds.includes(sampleOrderId) &&
        (global[0]?.without_fi ?? 1) === 0,
    };

    fs.mkdirSync(WIP, { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    console.log(`[M6.5.2.1] validation → ${REPORT_PATH}`);

    if (!report.pass) process.exitCode = 1;
  } finally {
    await disconnectPrisma(client);
  }
}

main().catch((err) => {
  console.error("[M6.5.2.1] validate fatal:", err);
  process.exit(1);
});
