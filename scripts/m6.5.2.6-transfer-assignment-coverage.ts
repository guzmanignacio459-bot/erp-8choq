/**
 * M6.5.2.6 — Transfer assignment coverage audit + remediation
 *
 *   npm run m6.5.2.6:assignments:coverage
 *   npm run m6.5.2.6:assignments:coverage -- --write
 */
import fs from "fs";
import path from "path";

import type { PrismaClient, TnOrder } from "@prisma/client";

import { isTnTransferOrder } from "../lib/financial-accounts/is-tn-transfer-order";
import { applyTransferFeeForTnOrder } from "../services/financial-items/apply-transfer-fee";
import {
  listPendingTransferAssignmentOrderIds,
  runPostT0TransferAssignmentsLive,
} from "../services/erp-v2-transfer-assignments-live";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { loadEnvLocal } = require("./lib/l0-env.mjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createPrisma, disconnectPrisma } = require("./lib/l1-prisma.mjs");

loadEnvLocal();

const WIP = path.join(process.cwd(), "_wip");
const REPORT_PATH = path.join(WIP, "m6.5.2.6-transfer-assignment-coverage-report.json");

async function coverageSnapshot(prisma: PrismaClient) {
  const paid: Pick<
    TnOrder,
    | "id"
    | "tnPaidAt"
    | "paymentGateway"
    | "paymentMethod"
    | "rawTnPayload"
    | "customerName"
  >[] = await prisma.tnOrder.findMany({
    where: { tnPaidAt: { not: null } },
    select: {
      id: true,
      tnPaidAt: true,
      paymentGateway: true,
      paymentMethod: true,
      rawTnPayload: true,
      customerName: true,
    },
  });
  const transfers = paid.filter(isTnTransferOrder);
  const transferIds = transfers.map((t) => t.id);
  const assignedSet = new Set(
    (
      await prisma.financialAccountAssignment.findMany({
        where: { originType: "TN_ORDER", originId: { in: transferIds } },
        select: { originId: true },
      })
    ).map((r) => r.originId)
  );

  const pending = transfers.filter((t) => !assignedSet.has(t.id));
  const tfRows = await prisma.$queryRaw<
    Array<{ origin_id: string; tf_sum: string; fi_count: number }>
  >`
    SELECT
      a.origin_id,
      COALESCE(SUM(fi.transfer_fee_allocated), 0)::text AS tf_sum,
      COUNT(fi.id)::int AS fi_count
    FROM financial_account_assignments a
    LEFT JOIN financial_items fi
      ON fi.origin_type = 'TN_ORDER' AND fi.origin_id = a.origin_id
    WHERE a.origin_type = 'TN_ORDER'
    GROUP BY a.origin_id
  `;

  const withoutTf = tfRows.filter(
    (r) => r.fi_count > 0 && Number(r.tf_sum) <= 0
  );

  return {
    transferOrders: transfers.length,
    assignments: assignedSet.size,
    pending: pending.length,
    pendingOrders: pending.map((o) => {
      const raw = (o.rawTnPayload ?? {}) as Record<string, unknown>;
      return {
        tnOrder: o.id,
        fecha: o.tnPaidAt?.toISOString() ?? null,
        gateway: raw.gateway_name ?? o.paymentGateway,
        customer: o.customerName,
      };
    }),
    assignedWithoutTransferFee: withoutTf.length,
    assignedWithoutTransferFeeIds: withoutTf.map((r) => r.origin_id),
  };
}

async function main() {
  const write = process.argv.includes("--write");

  if (!(process.env.DATABASE_URL ?? "").includes("neon.tech")) {
    throw new Error("DATABASE_URL Neon staging required");
  }

  const client = createPrisma();
  const prisma = client.prisma as PrismaClient;

  try {
    const before = await coverageSnapshot(prisma);

    let assignmentResult = null;
    let transferFeeFixed = 0;
    const transferFeeErrors: string[] = [];

    if (write) {
      assignmentResult = await runPostT0TransferAssignmentsLive({ dryRun: false });

      const afterAssign = await coverageSnapshot(prisma);
      const needsTf = afterAssign.assignedWithoutTransferFeeIds;

      for (const tnOrderId of needsTf) {
        try {
          const r = await applyTransferFeeForTnOrder(tnOrderId, { dryRun: false });
          if (r.ok) transferFeeFixed++;
          else transferFeeErrors.push(`${tnOrderId}: ${r.skipped ?? "failed"}`);
        } catch (err) {
          transferFeeErrors.push(
            `${tnOrderId}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    }

    const after = await coverageSnapshot(prisma);

    const report = {
      generatedAt: new Date().toISOString(),
      mode: write ? "write" : "audit",
      before,
      remediation: write
        ? {
            assignmentResult: assignmentResult?.stats ?? null,
            transferFeeOrdersFixed: transferFeeFixed,
            transferFeeErrors,
          }
        : null,
      after,
      checks: {
        allTransfersAssigned: after.pending === 0,
        transferFeeCoverage:
          after.assignedWithoutTransferFee === 0 && after.assignments === after.transferOrders,
        countsMatch: after.transferOrders === after.assignments,
      },
      pass:
        after.pending === 0 &&
        after.assignedWithoutTransferFee === 0 &&
        after.transferOrders === after.assignments,
    };

    fs.mkdirSync(WIP, { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    console.log(`[M6.5.2.6] report → ${REPORT_PATH}`);

    if (!report.pass && write) process.exitCode = 1;
    if (!write && before.pending > 0) process.exitCode = 1;
  } finally {
    await disconnectPrisma(client);
  }
}

main().catch((err) => {
  console.error("[M6.5.2.6] fatal:", err);
  process.exit(1);
});
