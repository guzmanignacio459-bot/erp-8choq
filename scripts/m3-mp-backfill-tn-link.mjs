#!/usr/bin/env node
/**
 * M3.1a — Backfill payments.tn_order_id + denorm tn_orders.mp_*
 * Staging only. Sin llamadas MP API.
 */
import fs from "fs";
import path from "path";

import { loadEnvLocal } from "./lib/l0-env.mjs";
import { assertSafeStagingUrl, createPrisma, disconnectPrisma } from "./lib/l1-db.mjs";
import {
  collectM3MpCoverage,
  denormTnMpHeaders,
} from "./lib/m3-mp-denorm.mjs";

loadEnvLocal();

const WIP = path.join(process.cwd(), "_wip");
const REPORT_PATH = path.join(WIP, "m3-mp-coverage.json");

async function backfillPaymentTnLinks(prisma) {
  const candidates = await prisma.payment.findMany({
    where: {
      erpOrderId: { not: null },
      erpOrder: { tnOrderId: { not: null } },
    },
    select: {
      id: true,
      tnOrderId: true,
      erpOrder: { select: { tnOrderId: true } },
    },
  });

  let linked = 0;
  let skipped = 0;
  const tnOrderIds = [];

  for (const p of candidates) {
    const targetTn = p.erpOrder?.tnOrderId;
    if (!targetTn) {
      skipped++;
      continue;
    }
    if (p.tnOrderId === targetTn) {
      tnOrderIds.push(targetTn);
      skipped++;
      continue;
    }

    await prisma.payment.update({
      where: { id: p.id },
      data: { tnOrderId: targetTn },
    });
    linked++;
    tnOrderIds.push(targetTn);
  }

  return { linked, skipped, candidates: candidates.length, tnOrderIds };
}

async function main() {
  const url = assertSafeStagingUrl(process.env.DATABASE_URL);
  if (!url) throw new Error("DATABASE_URL missing");

  const db = createPrisma();
  const prisma = db.prisma;

  try {
    const before = await collectM3MpCoverage(prisma);
    console.log("[M3.1a] coverage BEFORE:", JSON.stringify(before, null, 2));

    const linkResult = await backfillPaymentTnLinks(prisma);
    console.log("[M3.1a] payment tn_order_id backfill:", linkResult);

    const allTnWithPayment = await prisma.payment.findMany({
      where: { tnOrderId: { not: null } },
      select: { tnOrderId: true },
      distinct: ["tnOrderId"],
    });
    const denorm = await denormTnMpHeaders(
      prisma,
      allTnWithPayment.map((r) => r.tnOrderId)
    );
    console.log("[M3.1a] tn_orders mp_* denorm updated:", denorm.updated);

    const after = await collectM3MpCoverage(prisma);
    const report = {
      phase: "M3.1a",
      before,
      after,
      backfill: linkResult,
      denorm,
    };

    fs.mkdirSync(WIP, { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    console.log(`[M3.1a] wrote ${REPORT_PATH}`);

    console.log("\n[M3.1a] coverage AFTER (summary):");
    console.log(
      `  payments.withTnOrderId: ${after.payments.withTnOrderId}/${after.payments.total}`
    );
    console.log(
      `  tnOrders.withMpPaymentId: ${after.tnOrders.withMpPaymentId}/${after.tnOrders.total}`
    );
    console.log(
      `  tnOrders.withNetoMpOrden: ${after.tnOrders.withNetoMpOrden}/${after.tnOrders.total}`
    );

    if (after.payments.erpWithTnButPaymentMissingTnLink > 0) {
      console.warn(
        `[M3.1a] WARN: ${after.payments.erpWithTnButPaymentMissingTnLink} payments still missing tn_order_id`
      );
      process.exitCode = 1;
    }
  } finally {
    await disconnectPrisma(db);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
