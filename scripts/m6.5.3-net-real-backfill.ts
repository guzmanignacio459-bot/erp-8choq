/**
 * M6.5.3 — Backfill net_amount incluyendo transfer_fee_allocated
 *
 *   npm run m6.5.3:net-real:backfill
 *   npm run m6.5.3:net-real:backfill -- --write
 */
import fs from "fs";
import path from "path";

import type { PrismaClient } from "@prisma/client";

import { computeNetReal } from "../lib/financial-items/compute-net-real";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { loadEnvLocal } = require("./lib/l0-env.mjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createPrisma, disconnectPrisma } = require("./lib/l1-prisma.mjs");

loadEnvLocal();

const WIP = path.join(process.cwd(), "_wip");
const REPORT_PATH = path.join(WIP, "m6.5.3-net-real-backfill-report.json");

type FiTotals = {
  rowCount: number;
  grossTotal: number;
  discountTotal: number;
  tnFeeTotal: number;
  mpFeeTotal: number;
  shippingTotal: number;
  transferFeeTotal: number;
  netTotal: number;
};

async function aggregateTotals(prisma: PrismaClient): Promise<FiTotals> {
  const agg = await prisma.financialItem.aggregate({
    where: { originType: "TN_ORDER" },
    _sum: {
      grossAmount: true,
      discountAllocated: true,
      tnFeeAllocated: true,
      mpFeeAllocated: true,
      shippingAllocated: true,
      transferFeeAllocated: true,
      netAmount: true,
    },
    _count: { id: true },
  });

  return {
    rowCount: agg._count.id,
    grossTotal: Number(agg._sum.grossAmount ?? 0),
    discountTotal: Number(agg._sum.discountAllocated ?? 0),
    tnFeeTotal: Number(agg._sum.tnFeeAllocated ?? 0),
    mpFeeTotal: Number(agg._sum.mpFeeAllocated ?? 0),
    shippingTotal: Number(agg._sum.shippingAllocated ?? 0),
    transferFeeTotal: Number(agg._sum.transferFeeAllocated ?? 0),
    netTotal: Number(agg._sum.netAmount ?? 0),
  };
}

async function countAffectedRows(prisma: PrismaClient): Promise<number> {
  return prisma.financialItem.count({
    where: {
      originType: "TN_ORDER",
      transferFeeAllocated: { gt: 0 },
    },
  });
}

async function backfillNetAmount(prisma: PrismaClient): Promise<{
  rowsUpdated: number;
  parityErrors: number;
}> {
  const rows = await prisma.financialItem.findMany({
    where: {
      originType: "TN_ORDER",
      transferFeeAllocated: { gt: 0 },
    },
    select: {
      id: true,
      grossAmount: true,
      discountAllocated: true,
      tnFeeAllocated: true,
      mpFeeAllocated: true,
      shippingAllocated: true,
      transferFeeAllocated: true,
      netAmount: true,
    },
  });

  let rowsUpdated = 0;
  let parityErrors = 0;

  for (const row of rows) {
    const expected = computeNetReal({
      grossAmount: Number(row.grossAmount),
      discountAllocated: Number(row.discountAllocated),
      tnFeeAllocated: Number(row.tnFeeAllocated),
      mpFeeAllocated: Number(row.mpFeeAllocated),
      shippingAllocated: Number(row.shippingAllocated),
      transferFeeAllocated: Number(row.transferFeeAllocated),
    });

    if (Math.abs(expected - Number(row.netAmount)) > 0.01) {
      await prisma.financialItem.update({
        where: { id: row.id },
        data: { netAmount: expected },
      });
      rowsUpdated++;
    } else if (
      Math.abs(
        expected -
          computeNetReal({
            grossAmount: Number(row.grossAmount),
            discountAllocated: Number(row.discountAllocated),
            tnFeeAllocated: Number(row.tnFeeAllocated),
            mpFeeAllocated: Number(row.mpFeeAllocated),
            shippingAllocated: Number(row.shippingAllocated),
            transferFeeAllocated: 0,
          }) -
          Number(row.transferFeeAllocated)
      ) > 0.02
    ) {
      parityErrors++;
    }
  }

  return { rowsUpdated, parityErrors };
}

async function validateParity(prisma: PrismaClient): Promise<{
  mismatchCount: number;
  sample: string[];
}> {
  const rows = await prisma.financialItem.findMany({
    where: { originType: "TN_ORDER" },
    select: {
      id: true,
      grossAmount: true,
      discountAllocated: true,
      tnFeeAllocated: true,
      mpFeeAllocated: true,
      shippingAllocated: true,
      transferFeeAllocated: true,
      netAmount: true,
    },
  });

  const sample: string[] = [];
  let mismatchCount = 0;

  for (const row of rows) {
    const expected = computeNetReal({
      grossAmount: Number(row.grossAmount),
      discountAllocated: Number(row.discountAllocated),
      tnFeeAllocated: Number(row.tnFeeAllocated),
      mpFeeAllocated: Number(row.mpFeeAllocated),
      shippingAllocated: Number(row.shippingAllocated),
      transferFeeAllocated: Number(row.transferFeeAllocated),
    });
    if (Math.abs(expected - Number(row.netAmount)) > 0.01) {
      mismatchCount++;
      if (sample.length < 5) sample.push(row.id);
    }
  }

  return { mismatchCount, sample };
}

async function main() {
  const write = process.argv.includes("--write");

  if (!(process.env.DATABASE_URL ?? "").includes("neon.tech")) {
    throw new Error("DATABASE_URL Neon staging required");
  }

  const client = createPrisma();
  const prisma = client.prisma as PrismaClient;

  try {
    const before = await aggregateTotals(prisma);
    const affectedRows = await countAffectedRows(prisma);

    let backfillResult = null;
    if (write) {
      backfillResult = await backfillNetAmount(prisma);
    }

    const after = await aggregateTotals(prisma);
    const parity = await validateParity(prisma);

    const netDelta = round2(after.netTotal - before.netTotal);
    const expectedNetDelta = write ? round2(-before.transferFeeTotal) : 0;

    const report = {
      generatedAt: new Date().toISOString(),
      mode: write ? "write" : "audit",
      affectedRows,
      before: {
        netRealTotal: before.netTotal,
        transferFeeTotal: before.transferFeeTotal,
        grossTotal: before.grossTotal,
        discountTotal: before.discountTotal,
        tnFeeTotal: before.tnFeeTotal,
        mpFeeTotal: before.mpFeeTotal,
        shippingTotal: before.shippingTotal,
      },
      backfill: backfillResult,
      after: {
        netRealTotal: after.netTotal,
        transferFeeTotal: after.transferFeeTotal,
      },
      metrics: {
        filasAfectadas: affectedRows,
        netRealAntes: before.netTotal,
        netRealDespues: after.netTotal,
        diferenciaTotal: netDelta,
        diferenciaEsperada: expectedNetDelta,
      },
      validation: {
        grossUnchanged: before.grossTotal === after.grossTotal,
        discountUnchanged: before.discountTotal === after.discountTotal,
        tnFeeUnchanged: before.tnFeeTotal === after.tnFeeTotal,
        mpFeeUnchanged: before.mpFeeTotal === after.mpFeeTotal,
        shippingUnchanged: before.shippingTotal === after.shippingTotal,
        transferFeeUnchanged: before.transferFeeTotal === after.transferFeeTotal,
        netDecreasedByTransferFee:
          write &&
          Math.abs(netDelta - expectedNetDelta) <= 0.02 &&
          netDelta < 0,
        parityMismatchCount: parity.mismatchCount,
        paritySample: parity.sample,
      },
      pass:
        parity.mismatchCount === 0 &&
        before.grossTotal === after.grossTotal &&
        before.transferFeeTotal === after.transferFeeTotal &&
        (!write || Math.abs(netDelta + before.transferFeeTotal) <= 0.02),
    };

    fs.mkdirSync(WIP, { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    console.log(`[M6.5.3] report → ${REPORT_PATH}`);

    if (!report.pass) process.exitCode = 1;
  } finally {
    await disconnectPrisma(client);
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

main().catch((err) => {
  console.error("[M6.5.3] fatal:", err);
  process.exit(1);
});
