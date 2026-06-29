/**
 * M6.3.1 — Payments Recovery (MP backfill post-cutoff ~2026-06-08)
 *
 * Audit only:
 *   npm run m6.3.1:payments:recovery
 *
 * Full recovery:
 *   ERP_V2_DB_WRITE=true MP_ACCESS_TOKEN=... npm run m6.3.1:payments:recovery -- --write
 */
import fs from "fs";
import path from "path";

import { runPostT0MpAllocationLive } from "../services/erp-v2-allocations-mp-live";
import { syncTnPaymentFromMp } from "../services/erp-v2-payments-sync";
import { generateFinancialItemsFromTn } from "../services/financial-items/generate-from-tn";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { loadEnvLocal } = require("./lib/l0-env.mjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createPrisma, disconnectPrisma } = require("./lib/l1-prisma.mjs");

loadEnvLocal();
// Optional: vercel env pull .env.recovery.local (production secrets local run)
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
const REPORT_PATH = path.join(WIP, "m6.3.1-payments-recovery-report.json");
const ORDERS_PATH = path.join(WIP, "m6.3.1-affected-orders.json");

/** Corte RCA M6.3 — órdenes pagadas desde esta fecha ART */
const RECOVERY_CUTOFF = new Date("2026-06-08T00:00:00-03:00");

type AffectedOrder = {
  id: string;
  customerName: string | null;
  tnPaidAt: string;
  tnTotal: number;
  paymentGateway: string | null;
  syncedAt: string | null;
};

type RecoveryMetrics = {
  affectedOrderCount: number;
  paymentsLinked: number;
  paymentsMpCostSum: number;
  allocationUnitsWithMp: number;
  allocationMpFeeSum: number;
  financialItemsWithMpFee: number;
  financialItemsMpFeeSum: number;
  financialItemsNetRealSum: number;
};

function num(v: unknown): number {
  if (v == null) return 0;
  return Number(v);
}

function requireEnv(write: boolean) {
  const missing: string[] = [];
  if (!(process.env.DATABASE_URL ?? "").includes("neon.tech")) {
    missing.push("DATABASE_URL (Neon staging)");
  }
  if (write && process.env.ERP_V2_DB_WRITE !== "true") {
    missing.push("ERP_V2_DB_WRITE=true");
  }
  if (write && !(process.env.MP_ACCESS_TOKEN ?? "").trim()) {
    missing.push("MP_ACCESS_TOKEN");
  }
  if (missing.length) throw new Error(`Env missing: ${missing.join(", ")}`);
}

async function listAffectedOrders(prisma: {
  $queryRaw: typeof import("@prisma/client").PrismaClient.prototype.$queryRaw;
}): Promise<AffectedOrder[]> {
  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      customer_name: string | null;
      tn_paid_at: Date;
      tn_total: string;
      payment_gateway: string | null;
      synced_at: Date | null;
    }>
  >`
    SELECT o.id, o.customer_name, o.tn_paid_at, o.tn_total, o.payment_gateway, o.synced_at
    FROM tn_orders o
    WHERE o.tn_paid_at IS NOT NULL
      AND o.tn_paid_at >= ${RECOVERY_CUTOFF}
      AND LOWER(COALESCE(o.payment_gateway, '')) = 'mercado-pago'
      AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.tn_order_id = o.id)
    ORDER BY o.tn_paid_at ASC
  `;

  return rows.map((r) => ({
    id: r.id,
    customerName: r.customer_name,
    tnPaidAt: r.tn_paid_at.toISOString(),
    tnTotal: num(r.tn_total),
    paymentGateway: r.payment_gateway,
    syncedAt: r.synced_at?.toISOString() ?? null,
  }));
}

async function collectMetrics(
  prisma: {
    $queryRaw: typeof import("@prisma/client").PrismaClient.prototype.$queryRaw;
  },
  orderIds: string[]
): Promise<RecoveryMetrics> {
  if (!orderIds.length) {
    return {
      affectedOrderCount: 0,
      paymentsLinked: 0,
      paymentsMpCostSum: 0,
      allocationUnitsWithMp: 0,
      allocationMpFeeSum: 0,
      financialItemsWithMpFee: 0,
      financialItemsMpFeeSum: 0,
      financialItemsNetRealSum: 0,
    };
  }

  const [pay, alloc, fi] = await Promise.all([
    prisma.$queryRaw<
      [{ linked: number; cost_sum: string | null }]
    >`
      SELECT
        COUNT(DISTINCT p.tn_order_id)::int AS linked,
        SUM(COALESCE(p.mp_total_cost_real, 0)) AS cost_sum
      FROM payments p
      WHERE p.tn_order_id = ANY(${orderIds}::text[])
    `,
    prisma.$queryRaw<
      [{ units_mp: number; mp_sum: string | null }]
    >`
      SELECT
        COUNT(*) FILTER (WHERE COALESCE(a.mp_total_cost_allocated_real, 0) > 0)::int AS units_mp,
        SUM(COALESCE(a.mp_total_cost_allocated_real, 0)) AS mp_sum
      FROM tn_order_item_allocations a
      WHERE a.tn_order_id = ANY(${orderIds}::text[])
    `,
    prisma.$queryRaw<
      [{ fi_mp: number; mp_sum: string | null; net_sum: string | null }]
    >`
      SELECT
        COUNT(*) FILTER (WHERE fi.mp_fee_allocated > 0)::int AS fi_mp,
        SUM(fi.mp_fee_allocated) AS mp_sum,
        SUM(fi.net_amount) AS net_sum
      FROM financial_items fi
      WHERE fi.origin_type = 'TN_ORDER'
        AND fi.origin_id = ANY(${orderIds}::text[])
    `,
  ]);

  return {
    affectedOrderCount: orderIds.length,
    paymentsLinked: pay[0]?.linked ?? 0,
    paymentsMpCostSum: num(pay[0]?.cost_sum),
    allocationUnitsWithMp: alloc[0]?.units_mp ?? 0,
    allocationMpFeeSum: num(alloc[0]?.mp_sum),
    financialItemsWithMpFee: fi[0]?.fi_mp ?? 0,
    financialItemsMpFeeSum: num(fi[0]?.mp_sum),
    financialItemsNetRealSum: num(fi[0]?.net_sum),
  };
}

async function phase1Audit(
  prisma: Parameters<typeof listAffectedOrders>[0]
) {
  const orders = await listAffectedOrders(prisma);
  const orderIds = orders.map((o) => o.id);
  const metrics = await collectMetrics(prisma, orderIds);

  const tnTotalSum = orders.reduce((s, o) => s + o.tnTotal, 0);
  const firstDate = orders[0]?.tnPaidAt ?? null;
  const lastDate = orders[orders.length - 1]?.tnPaidAt ?? null;

  return {
    cutoff: RECOVERY_CUTOFF.toISOString(),
    criteria: {
      tnPaidAtGte: RECOVERY_CUTOFF.toISOString(),
      paymentGateway: "mercado-pago",
      noPaymentRow: true,
    },
    count: orders.length,
    tnTotalSum,
    dateRange: { from: firstDate, to: lastDate },
    orders,
    metrics,
  };
}

async function phase2BackfillPayments(orderIds: string[], dryRun: boolean) {
  const results: Array<{
    tnOrderId: string;
    ok: boolean;
    action?: string;
    mpPaymentId?: string;
    error?: string;
    code?: string;
  }> = [];

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const tnOrderId of orderIds) {
    if (dryRun) {
      results.push({ tnOrderId, ok: true, action: "dry_run" });
      continue;
    }

    const r = await syncTnPaymentFromMp({ tnOrderId, force: true });
    if (r.ok) {
      if (r.action === "created") created++;
      else if (r.action === "updated") updated++;
      else skipped++;
      results.push({
        tnOrderId,
        ok: true,
        action: r.action,
        mpPaymentId: r.mpPaymentId,
      });
    } else {
      failed++;
      results.push({
        tnOrderId,
        ok: false,
        error: r.error,
        code: r.code,
      });
    }

    // Gentle throttle for MP API
    await new Promise((res) => setTimeout(res, 150));
  }

  return { results, created, updated, skipped, failed };
}

async function phase3MpAllocation(dryRun: boolean) {
  return runPostT0MpAllocationLive({ dryRun });
}

async function phase4FinancialItemsRefresh(dryRun: boolean) {
  let cursor: string | null = null;
  let totals = {
    processed: 0,
    created: 0,
    updated: 0,
    skippedNoAllocation: 0,
    errors: 0,
    batches: 0,
  };

  for (;;) {
    const batch = await generateFinancialItemsFromTn({
      dryRun,
      cursor,
      maxBatches: 1,
      batchSize: 200,
    });
    totals.processed += batch.processed;
    totals.created += batch.created;
    totals.updated += batch.updated;
    totals.skippedNoAllocation += batch.skippedNoAllocation;
    totals.errors += batch.errors;
    totals.batches++;
    if (!batch.nextCursor || batch.processed === 0) break;
    if (batch.nextCursor === cursor) break;
    cursor = batch.nextCursor;
  }

  return totals;
}

function buildComparison(
  before: RecoveryMetrics,
  after: RecoveryMetrics
) {
  return {
    paymentsLinked: {
      before: before.paymentsLinked,
      after: after.paymentsLinked,
      delta: after.paymentsLinked - before.paymentsLinked,
    },
    paymentsMpCostSum: {
      before: before.paymentsMpCostSum,
      after: after.paymentsMpCostSum,
      delta: after.paymentsMpCostSum - before.paymentsMpCostSum,
    },
    allocationMpFeeSum: {
      before: before.allocationMpFeeSum,
      after: after.allocationMpFeeSum,
      delta: after.allocationMpFeeSum - before.allocationMpFeeSum,
    },
    allocationUnitsWithMp: {
      before: before.allocationUnitsWithMp,
      after: after.allocationUnitsWithMp,
      delta: after.allocationUnitsWithMp - before.allocationUnitsWithMp,
    },
    financialItemsWithMpFee: {
      before: before.financialItemsWithMpFee,
      after: after.financialItemsWithMpFee,
      delta: after.financialItemsWithMpFee - before.financialItemsWithMpFee,
    },
    financialItemsMpFeeSum: {
      before: before.financialItemsMpFeeSum,
      after: after.financialItemsMpFeeSum,
      delta: after.financialItemsMpFeeSum - before.financialItemsMpFeeSum,
    },
    financialItemsNetRealSum: {
      before: before.financialItemsNetRealSum,
      after: after.financialItemsNetRealSum,
      delta: after.financialItemsNetRealSum - before.financialItemsNetRealSum,
    },
  };
}

function evaluatePass(
  audit: Awaited<ReturnType<typeof phase1Audit>>,
  phase2: Awaited<ReturnType<typeof phase2BackfillPayments>> | null,
  phase3: Awaited<ReturnType<typeof phase3MpAllocation>> | null,
  comparison: ReturnType<typeof buildComparison> | null,
  write: boolean
): boolean {
  if (!write) return true;

  const syncOk =
    phase2 != null &&
    phase2.failed === 0 &&
    phase2.created + phase2.updated + phase2.skipped === audit.count;

  const mpAllocOk =
    phase3 != null &&
    phase3.errors.length === 0 &&
    (phase3.stats.allocationsEnriched > 0 || comparison?.allocationMpFeeSum.after === comparison?.allocationMpFeeSum.before);

  const dataOk =
    comparison != null &&
    comparison.paymentsLinked.after >= comparison.paymentsLinked.before &&
    comparison.allocationMpFeeSum.after > comparison.allocationMpFeeSum.before;

  return Boolean(syncOk && mpAllocOk && dataOk);
}

async function main() {
  const write = process.argv.includes("--write");
  requireEnv(write);

  const client = createPrisma();
  const { prisma } = client;

  try {
    console.log("[M6.3.1] Phase 1 — audit affected orders");
    const audit = await phase1Audit(prisma);

    fs.mkdirSync(WIP, { recursive: true });
    fs.writeFileSync(ORDERS_PATH, JSON.stringify(audit, null, 2));

    console.log("[M6.3.1] affected:", audit.count);
    console.log("[M6.3.1] date range:", audit.dateRange);
    console.log("[M6.3.1] tn_total sum:", audit.tnTotalSum);
    console.log("[M6.3.1] before metrics:", audit.metrics);
    console.log("[M6.3.1] orders list →", ORDERS_PATH);

    const orderIds = audit.orders.map((o) => o.id);
    const beforeMetrics = audit.metrics;

    let phase2: Awaited<ReturnType<typeof phase2BackfillPayments>> | null = null;
    let phase3: Awaited<ReturnType<typeof phase3MpAllocation>> | null = null;
    let phase4: Awaited<ReturnType<typeof phase4FinancialItemsRefresh>> | null =
      null;
    let afterMetrics: RecoveryMetrics | null = null;
    let comparison: ReturnType<typeof buildComparison> | null = null;

    if (write && orderIds.length > 0) {
      console.log("[M6.3.1] Phase 2 — payment sync", orderIds.length, "orders");
      phase2 = await phase2BackfillPayments(orderIds, false);
      console.log("[M6.3.1] sync created:", phase2.created);
      console.log("[M6.3.1] sync updated:", phase2.updated);
      console.log("[M6.3.1] sync skipped:", phase2.skipped);
      console.log("[M6.3.1] sync failed:", phase2.failed);
      if (phase2.failed > 0) {
        console.log(
          "[M6.3.1] failures sample:",
          phase2.results.filter((r) => !r.ok).slice(0, 5)
        );
      }

      console.log("[M6.3.1] Phase 3 — MP allocation live");
      phase3 = await phase3MpAllocation(false);
      console.log("[M6.3.1] MP orders processed:", phase3.stats.ordersProcessed);
      console.log(
        "[M6.3.1] MP allocations enriched:",
        phase3.stats.allocationsEnriched
      );
      console.log("[M6.3.1] MP orders failed:", phase3.stats.ordersFailed);

      console.log("[M6.3.1] Phase 4 — financial items refresh");
      phase4 = await phase4FinancialItemsRefresh(false);
      console.log("[M6.3.1] FI updated:", phase4.updated);

      afterMetrics = await collectMetrics(prisma, orderIds);
      comparison = buildComparison(beforeMetrics, afterMetrics);
      console.log("[M6.3.1] after metrics:", afterMetrics);
    }

    const report = {
      generatedAt: new Date().toISOString(),
      version: "m6.3.1",
      mode: write ? "write" : "audit-only",
      phase1: {
        count: audit.count,
        tnTotalSum: audit.tnTotalSum,
        dateRange: audit.dateRange,
        cutoff: audit.cutoff,
        criteria: audit.criteria,
      },
      before: beforeMetrics,
      phase2,
      phase3: phase3
        ? {
            ordersProcessed: phase3.stats.ordersProcessed,
            allocationsEnriched: phase3.stats.allocationsEnriched,
            ordersFailed: phase3.stats.ordersFailed,
            errors: phase3.errors,
          }
        : null,
      phase4,
      after: afterMetrics,
      comparison,
      summaryTable: comparison
        ? {
            Payments: {
              before: `${beforeMetrics.paymentsLinked} linked / $${beforeMetrics.paymentsMpCostSum.toFixed(2)} MP cost`,
              after: `${afterMetrics!.paymentsLinked} linked / $${afterMetrics!.paymentsMpCostSum.toFixed(2)} MP cost`,
            },
            "MP Fees (allocations)": {
              before: `$${beforeMetrics.allocationMpFeeSum.toFixed(2)} (${beforeMetrics.allocationUnitsWithMp} units)`,
              after: `$${afterMetrics!.allocationMpFeeSum.toFixed(2)} (${afterMetrics!.allocationUnitsWithMp} units)`,
            },
            "Financial Items con mp_fee": {
              before: `${beforeMetrics.financialItemsWithMpFee} rows / $${beforeMetrics.financialItemsMpFeeSum.toFixed(2)}`,
              after: `${afterMetrics!.financialItemsWithMpFee} rows / $${afterMetrics!.financialItemsMpFeeSum.toFixed(2)}`,
            },
            "Net Real (FI scope)": {
              before: `$${beforeMetrics.financialItemsNetRealSum.toFixed(2)}`,
              after: `$${afterMetrics!.financialItemsNetRealSum.toFixed(2)}`,
            },
          }
        : null,
      pass: evaluatePass(audit, phase2, phase3, comparison, write),
    };

    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    console.log("[M6.3.1] report →", REPORT_PATH);
    console.log("[M6.3.1] PASS:", report.pass);

    if (write && !report.pass) process.exitCode = 1;
  } finally {
    await disconnectPrisma(client);
  }
}

main().catch((err) => {
  console.error("[M6.3.1] fatal:", err);
  process.exit(1);
});
