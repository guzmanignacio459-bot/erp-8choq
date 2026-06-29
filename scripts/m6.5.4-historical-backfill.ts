/**
 * M6.5.4 — Historical transfer assignment backfill (one-shot)
 *
 *   npm run m6.5.4:historical:backfill
 *   npm run m6.5.4:historical:backfill -- --write
 */
import fs from "fs";
import path from "path";

import type { PrismaClient, TnOrder } from "@prisma/client";

import {
  JUNE_2026_FROM,
  JUNE_2026_TO,
  M6_5_4_BACKFILL_SOURCE,
  resolveHistoricalJuneTransferRule,
} from "../lib/financial-accounts/historical-june-transfer-rules";
import { isTnTransferOrder } from "../lib/financial-accounts/is-tn-transfer-order";
import { computeNetReal } from "../lib/financial-items/compute-net-real";
import { artRangeBoundsMs } from "../lib/erp/art-date";
import { applyTransferFeeForTnOrder } from "../services/financial-items/apply-transfer-fee";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { loadEnvLocal } = require("./lib/l0-env.mjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createPrisma, disconnectPrisma } = require("./lib/l1-prisma.mjs");

loadEnvLocal();

const WIP = path.join(process.cwd(), "_wip");
const REPORT_PATH = path.join(WIP, "m6.5.4-historical-backfill-report.json");

type JuneMetrics = {
  transferOrders: number;
  assignmentsByAccount: Array<{ cuenta: string; ordenes: number }>;
  unassigned: number;
  transferFeeTotal: number;
  netRealTotal: number;
  withoutTransferFee: number;
  withoutRequiredTransferFee: number;
  netParityErrors: number;
};

async function countOrdersMissingRequiredTransferFee(
  prisma: PrismaClient,
  orderIds: string[]
): Promise<number> {
  let missing = 0;
  for (const id of orderIds) {
    const assignment = await prisma.financialAccountAssignment.findUnique({
      where: { originType_originId: { originType: "TN_ORDER", originId: id } },
    });
    if (!assignment) {
      missing++;
      continue;
    }
    if (Number(assignment.ratePercentSnapshot) <= 0) continue;

    const fi = await prisma.financialItem.aggregate({
      where: { originType: "TN_ORDER", originId: id },
      _sum: { transferFeeAllocated: true },
      _count: { id: true },
    });
    if (fi._count.id === 0) continue;
    if (Number(fi._sum.transferFeeAllocated ?? 0) <= 0) missing++;
  }
  return missing;
}

async function loadJuneTransferIds(prisma: PrismaClient): Promise<string[]> {
  const bounds = artRangeBoundsMs(JUNE_2026_FROM, JUNE_2026_TO);
  if (!bounds) throw new Error("Invalid June bounds");

  const paid: Pick<
    TnOrder,
    "id" | "tnPaidAt" | "paymentGateway" | "paymentMethod" | "rawTnPayload"
  >[] = await prisma.tnOrder.findMany({
    where: {
      tnPaidAt: {
        gte: new Date(bounds.startMs),
        lte: new Date(bounds.endMs),
      },
    },
    select: {
      id: true,
      tnPaidAt: true,
      paymentGateway: true,
      paymentMethod: true,
      rawTnPayload: true,
    },
  });

  return paid.filter(isTnTransferOrder).map((o) => o.id);
}

async function snapshotJuneMetrics(
  prisma: PrismaClient,
  orderIds: string[]
): Promise<JuneMetrics> {
  const assignments = await prisma.financialAccountAssignment.findMany({
    where: { originType: "TN_ORDER", originId: { in: orderIds } },
    include: { account: { select: { name: true } } },
  });

  const byAccount = new Map<string, number>();
  for (const a of assignments) {
    byAccount.set(a.account.name, (byAccount.get(a.account.name) ?? 0) + 1);
  }

  const withoutRequiredTransferFee = await countOrdersMissingRequiredTransferFee(
    prisma,
    orderIds
  );

  const fiAgg = await prisma.financialItem.aggregate({
    where: { originType: "TN_ORDER", originId: { in: orderIds } },
    _sum: { transferFeeAllocated: true, netAmount: true },
  });

  const withoutTf = await prisma.financialItem.count({
    where: {
      originType: "TN_ORDER",
      originId: { in: orderIds },
      transferFeeAllocated: { lte: 0 },
    },
  });

  const fiRows = await prisma.financialItem.findMany({
    where: { originType: "TN_ORDER", originId: { in: orderIds } },
    select: {
      grossAmount: true,
      discountAllocated: true,
      tnFeeAllocated: true,
      mpFeeAllocated: true,
      shippingAllocated: true,
      transferFeeAllocated: true,
      netAmount: true,
    },
  });

  let netParityErrors = 0;
  for (const fi of fiRows) {
    const expected = computeNetReal({
      grossAmount: Number(fi.grossAmount),
      discountAllocated: Number(fi.discountAllocated),
      tnFeeAllocated: Number(fi.tnFeeAllocated),
      mpFeeAllocated: Number(fi.mpFeeAllocated),
      shippingAllocated: Number(fi.shippingAllocated),
      transferFeeAllocated: Number(fi.transferFeeAllocated),
    });
    if (Math.abs(expected - Number(fi.netAmount)) > 0.01) netParityErrors++;
  }

  return {
    transferOrders: orderIds.length,
    assignmentsByAccount: [...byAccount.entries()]
      .map(([cuenta, ordenes]) => ({ cuenta, ordenes }))
      .sort((a, b) => a.cuenta.localeCompare(b.cuenta)),
    unassigned: orderIds.length - assignments.length,
    transferFeeTotal: Number(fiAgg._sum.transferFeeAllocated ?? 0),
    netRealTotal: Number(fiAgg._sum.netAmount ?? 0),
    withoutTransferFee: withoutTf,
    withoutRequiredTransferFee,
    netParityErrors,
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
    const orderIds = await loadJuneTransferIds(prisma);
    const before = await snapshotJuneMetrics(prisma, orderIds);

    const accounts = await prisma.financialAccount.findMany({
      select: { id: true, name: true, ratePercent: true },
    });
    const accountByName = new Map(accounts.map((a) => [a.name, a]));

    const orders = await prisma.tnOrder.findMany({
      where: { id: { in: orderIds } },
      select: { id: true, tnPaidAt: true },
    });

    let assignmentsUpdated = 0;
    let assignmentsCreated = 0;
    let transferFeesApplied = 0;
    const errors: string[] = [];
    const unmapped: string[] = [];

    if (write) {
      for (const order of orders) {
        if (!order.tnPaidAt) {
          errors.push(`${order.id}: unpaid`);
          continue;
        }

        const rule = resolveHistoricalJuneTransferRule(order.tnPaidAt.getTime());
        if (!rule) {
          unmapped.push(order.id);
          continue;
        }

        const account = accountByName.get(rule.accountName);
        if (!account) {
          errors.push(`${order.id}: account not found ${rule.accountName}`);
          continue;
        }

        const existing = await prisma.financialAccountAssignment.findUnique({
          where: {
            originType_originId: { originType: "TN_ORDER", originId: order.id },
          },
        });

        if (existing) {
          await prisma.financialAccountAssignment.update({
            where: { id: existing.id },
            data: {
              accountId: account.id,
              ratePercentSnapshot: rule.ratePercent,
              assignmentSource: M6_5_4_BACKFILL_SOURCE,
            },
          });
          assignmentsUpdated++;
        } else {
          await prisma.financialAccountAssignment.create({
            data: {
              originType: "TN_ORDER",
              originId: order.id,
              accountId: account.id,
              assignmentSource: M6_5_4_BACKFILL_SOURCE,
              assignedAt: order.tnPaidAt,
              ratePercentSnapshot: rule.ratePercent,
            },
          });
          assignmentsCreated++;
        }
      }

      for (const tnOrderId of orderIds) {
        try {
          const r = await applyTransferFeeForTnOrder(tnOrderId, { dryRun: false });
          if (r.ok) transferFeesApplied++;
          else errors.push(`${tnOrderId}: tf ${r.skipped ?? "failed"}`);
        } catch (err) {
          errors.push(
            `${tnOrderId}: tf ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    }

    const after = await snapshotJuneMetrics(prisma, orderIds);

    const report = {
      generatedAt: new Date().toISOString(),
      mode: write ? "write" : "dry-run",
      scope: { juneFrom: JUNE_2026_FROM, juneTo: JUNE_2026_TO, orderCount: orderIds.length },
      before,
      write: write
        ? {
            assignmentsUpdated,
            assignmentsCreated,
            transferFeesApplied,
            unmappedDuringWrite: unmapped,
            errors,
          }
        : null,
      after,
      assignmentsAfter: after.assignmentsByAccount,
      transferFee: {
        before: round2(before.transferFeeTotal),
        after: round2(after.transferFeeTotal),
        delta: round2(after.transferFeeTotal - before.transferFeeTotal),
      },
      netReal: {
        before: round2(before.netRealTotal),
        after: round2(after.netRealTotal),
        delta: round2(after.netRealTotal - before.netRealTotal),
      },
      validation: {
        coverage100: after.unassigned === 0 && unmapped.length === 0,
        noUnassigned: after.unassigned === 0,
        noOutsideRules: unmapped.length === 0,
        noMissingTransferFee: after.withoutRequiredTransferFee === 0,
        netParityOk: after.netParityErrors === 0,
        errorsEmpty: errors.length === 0,
      },
      pass:
        write &&
        after.unassigned === 0 &&
        unmapped.length === 0 &&
        after.withoutRequiredTransferFee === 0 &&
        after.netParityErrors === 0 &&
        errors.length === 0,
    };

    fs.mkdirSync(WIP, { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    console.log(`[M6.5.4] report → ${REPORT_PATH}`);

    if (write && !report.pass) process.exitCode = 1;
  } finally {
    await disconnectPrisma(client);
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

main().catch((err) => {
  console.error("[M6.5.4] fatal:", err);
  process.exit(1);
});
