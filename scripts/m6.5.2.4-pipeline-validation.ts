/**
 * M6.5.2.4 — Validación transfer assignment automation
 *
 *   npm run m6.5.2.4:pipeline:validate
 *
 * NO ejecuta backfill ni write — solo dry-run e invariantes.
 */
import fs from "fs";
import path from "path";

import type { PrismaClient, TnOrder } from "@prisma/client";

import { isTnTransferOrder } from "../lib/financial-accounts/is-tn-transfer-order";
import {
  resolveFinancialAccountForDate,
} from "../lib/financial-accounts/resolve-financial-account-assignment";
import { getTransferAssignmentsPendingSnapshot } from "../lib/erp/v2/transfer-assignments-pending-health";
import {
  assignTransferOrderLive,
  runPostT0TransferAssignmentsLive,
} from "../services/erp-v2-transfer-assignments-live";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { loadEnvLocal } = require("./lib/l0-env.mjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createPrisma, disconnectPrisma } = require("./lib/l1-prisma.mjs");

loadEnvLocal();

const WIP = path.join(process.cwd(), "_wip");
const REPORT_PATH = path.join(WIP, "m6.5.2.4-pipeline-validation-report.json");

type AssignmentSnapshot = {
  count: number;
  rows: Array<{
    originId: string;
    accountId: string;
    ratePercentSnapshot: string;
    assignedAt: string;
  }>;
};

async function loadAssignmentSnapshot(
  prisma: PrismaClient
): Promise<AssignmentSnapshot> {
  const rows: Array<{
    originId: string;
    accountId: string;
    ratePercentSnapshot: unknown;
    assignedAt: Date;
  }> = await prisma.financialAccountAssignment.findMany({
    where: { originType: "TN_ORDER" },
    select: {
      originId: true,
      accountId: true,
      ratePercentSnapshot: true,
      assignedAt: true,
    },
    orderBy: { originId: "asc" },
  });
  return {
    count: rows.length,
    rows: rows.map((r) => ({
      originId: r.originId,
      accountId: r.accountId,
      ratePercentSnapshot: String(r.ratePercentSnapshot),
      assignedAt: r.assignedAt.toISOString(),
    })),
  };
}

function assertPipelineStageOrder(): { pass: boolean; details: string } {
  const src = fs.readFileSync(
    path.join(process.cwd(), "services/erp-v2-live-pipeline.ts"),
    "utf8"
  );
  const commercialIdx = src.indexOf("// Stage 3 — Commercial");
  const transferIdx = src.indexOf("// Stage 4 — Transfer assignments");
  const paymentsIdx = src.indexOf("// Stage 5 — Payment sync");
  const fiIdx = src.indexOf("// Stage 7 — Financial items");
  const ok =
    commercialIdx >= 0 &&
    transferIdx > commercialIdx &&
    paymentsIdx > transferIdx &&
    fiIdx > paymentsIdx &&
    src.includes("runPostT0TransferAssignmentsLive");
  return {
    pass: ok,
    details: ok
      ? "Commercial → Transfer Assignments → Payments → FI"
      : "stage order mismatch in erp-v2-live-pipeline.ts",
  };
}

function snapshotsEqual(a: AssignmentSnapshot, b: AssignmentSnapshot): boolean {
  if (a.count !== b.count) return false;
  return JSON.stringify(a.rows) === JSON.stringify(b.rows);
}

async function main() {
  if (!(process.env.DATABASE_URL ?? "").includes("neon.tech")) {
    throw new Error("DATABASE_URL Neon staging required");
  }

  const client = createPrisma();
  const { prisma } = client;

  try {
    const activeAccounts = await prisma.financialAccount.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        ratePercent: true,
        isActive: true,
      },
      orderBy: { name: "asc" },
    });

    const paidOrders: Pick<
      TnOrder,
      | "id"
      | "tnPaidAt"
      | "tnCreatedAt"
      | "customerName"
      | "paymentGateway"
      | "paymentMethod"
      | "rawTnPayload"
    >[] = await prisma.tnOrder.findMany({
      where: { tnPaidAt: { not: null } },
      select: {
        id: true,
        tnPaidAt: true,
        tnCreatedAt: true,
        customerName: true,
        paymentGateway: true,
        paymentMethod: true,
        rawTnPayload: true,
      },
    });
    const transferIds = paidOrders.filter(isTnTransferOrder).map((o) => o.id);
    const assignedRows: Array<{ originId: string }> =
      await prisma.financialAccountAssignment.findMany({
      where: {
        originType: "TN_ORDER",
        originId: { in: transferIds },
      },
      select: { originId: true },
    });
    const assignedSet = new Set(assignedRows.map((r) => r.originId));

    const pendingOrders = [];
    for (const o of paidOrders.filter(
      (x) => isTnTransferOrder(x) && !assignedSet.has(x.id)
    )) {
      const resolution = o.tnPaidAt
        ? await resolveFinancialAccountForDate(o.tnPaidAt)
        : null;
      pendingOrders.push({
        orderId: o.id,
        fechaCreacion: o.tnCreatedAt?.toISOString() ?? null,
        fechaPago: o.tnPaidAt?.toISOString() ?? null,
        cliente: o.customerName,
        payment_gateway: o.paymentGateway,
        gateway_name:
          o.rawTnPayload &&
          typeof o.rawTnPayload === "object" &&
          !Array.isArray(o.rawTnPayload)
            ? ((o.rawTnPayload as Record<string, unknown>).gateway_name ?? null)
            : null,
        assignmentActual: null,
        resolverCuenta: resolution
          ? {
              accountId: resolution.account.id,
              name: resolution.account.name,
              ratePercent: Number(resolution.account.ratePercent),
              source: resolution.source,
            }
          : null,
      });
    }
    pendingOrders.sort((a, b) =>
      (a.fechaPago ?? "").localeCompare(b.fechaPago ?? "")
    );

    const snapshotBefore = await loadAssignmentSnapshot(prisma);
    const stageOrder = assertPipelineStageOrder();
    const health = await getTransferAssignmentsPendingSnapshot();

    const liveDryRun = await runPostT0TransferAssignmentsLive({ dryRun: true });
    const snapshotAfter = await loadAssignmentSnapshot(prisma);

    const sampleAssignedId = snapshotBefore.rows[0]?.originId;
    let idempotencyCheck = { pass: false, sampleOrderId: sampleAssignedId ?? null };
    if (sampleAssignedId) {
      const skipResult = await assignTransferOrderLive(sampleAssignedId, {
        dryRun: true,
      });
      idempotencyCheck = {
        pass:
          skipResult.ok &&
          skipResult.action === "skipped" &&
          skipResult.skipReason === "already_assigned",
        sampleOrderId: sampleAssignedId,
      };
    }

    const activeAccount = activeAccounts.length === 1 ? activeAccounts[0] : null;
    const pendingWouldUseActive =
      pendingOrders.length > 0 &&
      pendingOrders.every(
        (p) =>
          p.resolverCuenta?.accountId === activeAccount?.id &&
          p.resolverCuenta?.ratePercent === Number(activeAccount?.ratePercent ?? -1)
      );

    const checks = {
      exactlyOneActiveAccount: activeAccounts.length === 1,
      pendingCountIs6: pendingOrders.length === 6,
      pipelineStageOrder: stageOrder.pass,
      healthCheckPresent: health.count === pendingOrders.length,
      dryRunCreatesNoDbRows: snapshotsEqual(snapshotBefore, snapshotAfter),
      dryRunWouldAssignPending:
        liveDryRun.stats.ordersPending === pendingOrders.length &&
        liveDryRun.stats.assignmentsWouldCreate === pendingOrders.length,
      idempotencySkipsExisting: idempotencyCheck.pass,
      historicalAssignmentsUnchanged: snapshotsEqual(snapshotBefore, snapshotAfter),
      pendingResolverUsesActiveAccount: pendingWouldUseActive,
    };

    const report = {
      generatedAt: new Date().toISOString(),
      mode: "validate-only (no write, no backfill)",
      parteA: {
        activeAccount: activeAccount
          ? {
              accountId: activeAccount.id,
              name: activeAccount.name,
              ratePercent: Number(activeAccount.ratePercent),
              active: activeAccount.isActive,
            }
          : null,
        activeAccountsCount: activeAccounts.length,
        pass: checks.exactlyOneActiveAccount,
      },
      parteB: {
        orders: pendingOrders,
        resolverSummary: pendingOrders.map((p) => ({
          orderId: p.orderId,
          resolver: p.resolverCuenta,
        })),
      },
      stageOrder,
      health,
      liveDryRun: {
        stats: liveDryRun.stats,
        sampleResults: liveDryRun.orderResults.slice(0, 3),
      },
      idempotencyCheck,
      historicalSnapshot: {
        countBefore: snapshotBefore.count,
        countAfter: snapshotAfter.count,
        unchanged: checks.historicalAssignmentsUnchanged,
      },
      checks,
      pass: Object.values(checks).every(Boolean),
    };

    fs.mkdirSync(WIP, { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    console.log(`[M6.5.2.4] validation → ${REPORT_PATH}`);

    if (!report.pass) process.exitCode = 1;
  } finally {
    await disconnectPrisma(client);
  }
}

main().catch((err) => {
  console.error("[M6.5.2.4] validate fatal:", err);
  process.exit(1);
});
