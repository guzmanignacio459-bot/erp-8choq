/**
 * M5.5 — Pipeline health checks, KPIs, drift detection, burn-in
 */

import { validateInventoryProjection } from "@/lib/erp/v2/validate-inventory-projection";
import {
  getPaymentsPendingSnapshot,
  PAYMENTS_PENDING_FAIL_HOURS,
} from "@/lib/erp/v2/payments-pending-health";
import {
  getTransferAssignmentsPendingSnapshot,
  TRANSFER_ASSIGNMENTS_FAIL_HOURS,
} from "@/lib/erp/v2/transfer-assignments-pending-health";
import { getPrisma } from "@/lib/db/prisma";
import { loadProjectionValidationInputs } from "@/services/erp-v2-inventory-projection";
import { loadActiveSnapshotDate } from "@/services/erp-v2-stock-ledger";
import { checkPipelineStaleDrift } from "@/services/erp-v2-pipeline-stale-alert";
import {
  computePipelineStale,
  type PipelineStaleStatus,
} from "@/lib/erp/v2/pipeline-stale";
import type { LivePipelineReport } from "@/types/erp-v2-live-pipeline";
import type {
  BurnInReport,
  BurnInWindow,
  DriftCheckId,
  DriftCheckResult,
  HealthCheckStatus,
  PaymentsPendingSummary,
  PipelineHealthCheck,
  PipelineKpis,
  PipelineRunSummary,
  TransferAssignmentsPendingSummary,
} from "@/types/erp-v2-pipeline-health";

const MP_TOLERANCE = 0.02;

function classifyOverall(checks: Record<DriftCheckId, DriftCheckResult>): HealthCheckStatus {
  const values = Object.values(checks);
  if (
    values.some(
      (c) =>
        !c.pass &&
        (c.id === "projection" ||
          c.id === "pipeline_stale" ||
          c.id === "payments_pending" ||
          c.id === "transfer_assignments_pending")
    )
  ) {
    return "FAIL";
  }
  if (values.filter((c) => !c.pass).length >= 2) return "FAIL";
  if (values.some((c) => !c.pass)) return "WARNING";
  return "PASS";
}

async function checkProjectionDrift(): Promise<DriftCheckResult> {
  const inputs = await loadProjectionValidationInputs();
  const validation = validateInventoryProjection({
    snapshotLines: inputs.snapshotLines,
    movements: inputs.movements,
    projectionRows: inputs.rows,
    movementsPostT0: inputs.movementsPostT0,
  });

  return {
    id: "projection",
    pass: validation.vI4.pass,
    message: validation.vI4.pass
      ? "snapshot + ledger === projection (V-I4 PASS)"
      : "projection drift: V-I4 FAIL",
    details: {
      vI3: validation.vI3.pass,
      vI4: validation.vI4.pass,
      snapshotQty: inputs.totals.snapshotQuantityTotal,
      netDelta: inputs.totals.netDeltaTotal,
      projectedQty: inputs.totals.projectedQuantityTotal,
      movementsPostT0: inputs.movementsPostT0,
    },
  };
}

async function checkUnitsDrift(snapshotDate: Date): Promise<DriftCheckResult> {
  const prisma = getPrisma();
  const rows = await prisma.$queryRaw<
    Array<{ qty_sum: number; unit_count: number }>
  >`
    SELECT
      COALESCE(SUM(i.quantity), 0)::int AS qty_sum,
      (
        SELECT COUNT(*)::int
        FROM tn_order_item_units u
        INNER JOIN tn_orders o ON o.id = u.tn_order_id
        WHERE o.synced_at >= ${snapshotDate} OR o.tn_paid_at >= ${snapshotDate}
      ) AS unit_count
    FROM tn_order_items i
    INNER JOIN tn_orders o ON o.id = i.tn_order_id
    WHERE o.synced_at >= ${snapshotDate} OR o.tn_paid_at >= ${snapshotDate}
  `;

  const qtySum = rows[0]?.qty_sum ?? 0;
  const unitCount = rows[0]?.unit_count ?? 0;
  const delta = qtySum - unitCount;

  return {
    id: "units",
    pass: delta === 0,
    message:
      delta === 0
        ? "SUM(quantity) === COUNT(units) post-T0"
        : `units drift: qty_sum=${qtySum} unit_count=${unitCount} delta=${delta}`,
    details: { qtySum, unitCount, delta },
  };
}

async function checkCommercialDrift(snapshotDate: Date): Promise<DriftCheckResult> {
  const prisma = getPrisma();
  const rows = await prisma.$queryRaw<Array<{ missing: number; total: number }>>`
    SELECT
      COUNT(*) FILTER (WHERE a.id IS NULL)::int AS missing,
      COUNT(*)::int AS total
    FROM tn_order_item_units u
    INNER JOIN tn_orders o ON o.id = u.tn_order_id
    LEFT JOIN tn_order_item_allocations a ON a.tn_order_item_unit_id = u.id
    WHERE (o.synced_at >= ${snapshotDate} OR o.tn_paid_at >= ${snapshotDate})
      AND COALESCE(o.commercial_status::text, '') NOT IN ('cancelado', 'reembolsado')
      AND (
        SELECT COALESCE(SUM(i.quantity), 0)::int
        FROM tn_order_items i
        WHERE i.tn_order_id = o.id
      ) = (
        SELECT COUNT(*)::int
        FROM tn_order_item_units u2
        WHERE u2.tn_order_id = o.id
      )
  `;

  const missing = rows[0]?.missing ?? 0;
  const total = rows[0]?.total ?? 0;

  return {
    id: "commercial",
    pass: missing === 0,
    message:
      missing === 0
        ? "1 commercial allocation per unit post-T0"
        : `${missing}/${total} units sin allocation comercial`,
    details: { missing, total },
  };
}

async function checkStockDrift(snapshotDate: Date): Promise<DriftCheckResult> {
  const prisma = getPrisma();
  const rows = await prisma.$queryRaw<Array<{ missing: number; total: number }>>`
    SELECT
      COUNT(*) FILTER (WHERE sm.id IS NULL)::int AS missing,
      COUNT(*)::int AS total
    FROM tn_order_item_units u
    INNER JOIN tn_orders o ON o.id = u.tn_order_id
    INNER JOIN tn_order_item_allocations a ON a.tn_order_item_unit_id = u.id
    LEFT JOIN stock_movements sm
      ON sm.tn_order_item_unit_id = u.id AND sm.movement_type = 'sale'
    WHERE (o.synced_at >= ${snapshotDate} OR o.tn_paid_at >= ${snapshotDate})
      AND COALESCE(o.commercial_status::text, '') NOT IN ('cancelado', 'reembolsado')
      AND u.is_stockable = true
  `;

  const missing = rows[0]?.missing ?? 0;
  const total = rows[0]?.total ?? 0;

  return {
    id: "stock",
    pass: missing === 0,
    message:
      missing === 0
        ? "1 sale movement per stockable unit post-T0"
        : `${missing}/${total} stockable units sin sale movement`,
    details: { missing, total },
  };
}

async function checkMpDrift(snapshotDate: Date): Promise<DriftCheckResult> {
  const prisma = getPrisma();
  const rows = await prisma.$queryRaw<
    Array<{ mismatches: number; orders_checked: number }>
  >`
    WITH mp_orders AS (
      SELECT
        o.id,
        COALESCE(p.mp_net_received_amount, 0)::float AS net_received,
        COALESCE(SUM(a.neto_prenda_real), 0)::float AS alloc_sum
      FROM tn_orders o
      INNER JOIN payments p ON p.tn_order_id = o.id
      INNER JOIN tn_order_item_allocations a ON a.tn_order_id = o.id
      WHERE (o.synced_at >= ${snapshotDate} OR o.tn_paid_at >= ${snapshotDate})
        AND a.neto_prenda_real IS NOT NULL
        AND p.mp_net_received_amount IS NOT NULL
      GROUP BY o.id, p.mp_net_received_amount
    )
    SELECT
      COUNT(*) FILTER (WHERE ABS(alloc_sum - net_received) > ${MP_TOLERANCE})::int AS mismatches,
      COUNT(*)::int AS orders_checked
    FROM mp_orders
  `;

  const mismatches = rows[0]?.mismatches ?? 0;
  const ordersChecked = rows[0]?.orders_checked ?? 0;

  return {
    id: "mp",
    pass: mismatches === 0,
    message:
      mismatches === 0
        ? "Σ neto_prenda_real === net_received_amount (MP orders)"
        : `${mismatches}/${ordersChecked} MP orders con drift neto`,
    details: { mismatches, ordersChecked, tolerance: MP_TOLERANCE },
  };
}

async function checkPaymentsPendingDrift(): Promise<DriftCheckResult> {
  const snap = await getPaymentsPendingSnapshot();
  const pass = snap.status === "PASS";

  return {
    id: "payments_pending",
    pass,
    message: snap.message,
    details: {
      count: snap.count,
      status: snap.status,
      oldestOrderId: snap.oldestOrderId,
      oldestPaidAt: snap.oldestPaidAt,
      lagHours: snap.lagHours,
      failThresholdHours: PAYMENTS_PENDING_FAIL_HOURS,
    },
  };
}

async function checkTransferAssignmentsPendingDrift(): Promise<DriftCheckResult> {
  const snap = await getTransferAssignmentsPendingSnapshot();
  const pass = snap.status === "PASS";

  return {
    id: "transfer_assignments_pending",
    pass,
    message: snap.message,
    details: {
      count: snap.count,
      status: snap.status,
      oldestOrderId: snap.oldestOrderId,
      oldestPaidAt: snap.oldestPaidAt,
      lagHours: snap.lagHours,
      failThresholdHours: TRANSFER_ASSIGNMENTS_FAIL_HOURS,
    },
  };
}

export async function runPipelineHealthCheck(): Promise<PipelineHealthCheck> {
  const snapshotDate = await loadActiveSnapshotDate();

  const [
    projection,
    units,
    commercial,
    stock,
    mp,
    payments_pending,
    transfer_assignments_pending,
    pipelineStale,
  ] = await Promise.all([
    checkProjectionDrift(),
    checkUnitsDrift(snapshotDate),
    checkCommercialDrift(snapshotDate),
    checkStockDrift(snapshotDate),
    checkMpDrift(snapshotDate),
    checkPaymentsPendingDrift(),
    checkTransferAssignmentsPendingDrift(),
    checkPipelineStaleDrift(),
  ]);

  const checks = {
    projection,
    units,
    commercial,
    stock,
    mp,
    payments_pending,
    transfer_assignments_pending,
    pipeline_stale: pipelineStale,
  };
  const overall = classifyOverall(checks);
  const driftDetected = Object.values(checks).some(
    (c) => !c.pass && c.id !== "projection"
  );

  return {
    checkedAt: new Date().toISOString(),
    overall,
    checks,
    driftDetected: driftDetected || !projection.pass,
  };
}

export async function getPipelineKpis(windowHours: number): Promise<PipelineKpis> {
  const prisma = getPrisma();
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

  const runs = await prisma.pipelineRun.findMany({
    where: {
      startedAt: { gte: since },
      status: { in: ["success", "failed"] },
    },
    select: {
      status: true,
      durationMs: true,
      ordersImported: true,
      warningsCount: true,
    },
  });

  const totalRuns = runs.length;
  const successRuns = runs.filter((r) => r.status === "success").length;
  const failedRuns = runs.filter((r) => r.status === "failed").length;
  const durations = runs
    .map((r) => r.durationMs ?? 0)
    .filter((d) => d > 0);

  return {
    windowHours,
    totalRuns,
    successRuns,
    failedRuns,
    successRate: totalRuns ? successRuns / totalRuns : 1,
    avgDurationMs: durations.length
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : 0,
    maxDurationMs: durations.length ? Math.max(...durations) : 0,
    ordersImported: runs.reduce((s, r) => s + r.ordersImported, 0),
    warningsCount: runs.reduce((s, r) => s + r.warningsCount, 0),
  };
}

function parseReportJson(value: unknown): {
  projectionStatus: string | null;
  healthStatus: HealthCheckStatus | null;
} {
  if (!value || typeof value !== "object") {
    return { projectionStatus: null, healthStatus: null };
  }
  const report = value as LivePipelineReport & {
    healthCheck?: PipelineHealthCheck;
  };

  let projectionStatus: string | null = null;
  if (report.projection?.vI4 === true) projectionStatus = "PASS";
  else if (report.projection?.vI4 === false) projectionStatus = "FAIL";
  else if (report.projection?.status) projectionStatus = report.projection.status.toUpperCase();

  return {
    projectionStatus,
    healthStatus: report.healthCheck?.overall ?? null,
  };
}

export function toPipelineRunSummary(
  row: {
    id: string;
    startedAt: Date;
    finishedAt: Date | null;
    durationMs: number | null;
    status: string;
    ordersImported: number;
    unitsCreated: number;
    commercialAllocationsCreated: number;
    mpAllocationsCreated: number;
    stockMovementsCreated: number;
    warningsCount: number;
    errorsCount: number;
    pipelineVersion: string;
    failedStage: string | null;
    reportJson: unknown;
  }
): PipelineRunSummary {
  const parsed = parseReportJson(row.reportJson);
  return {
    id: row.id,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    durationMs: row.durationMs,
    status: row.status,
    ordersImported: row.ordersImported,
    unitsCreated: row.unitsCreated,
    commercialAllocationsCreated: row.commercialAllocationsCreated,
    mpAllocationsCreated: row.mpAllocationsCreated,
    stockMovementsCreated: row.stockMovementsCreated,
    warningsCount: row.warningsCount,
    errorsCount: row.errorsCount,
    pipelineVersion: row.pipelineVersion,
    failedStage: row.failedStage,
    projectionStatus: parsed.projectionStatus,
    healthStatus: parsed.healthStatus,
  };
}

function toPipelineStaleSummary(
  check: DriftCheckResult
): PipelineStaleStatus {
  return computePipelineStale({
    lastRunStartedAt:
      typeof check.details.lastRunAt === "string"
        ? new Date(check.details.lastRunAt)
        : null,
    lastRunStatus:
      typeof check.details.lastRunStatus === "string"
        ? check.details.lastRunStatus
        : null,
  });
}

export async function getPipelineSystemHealth(): Promise<{
  latestRun: PipelineRunSummary | null;
  kpis24h: PipelineKpis;
  recentRuns: PipelineRunSummary[];
  healthCheck: PipelineHealthCheck | null;
  pipelineStale: PipelineStaleStatus | null;
  paymentsPending: PaymentsPendingSummary | null;
  transferAssignmentsPending: TransferAssignmentsPendingSummary | null;
}> {
  const prisma = getPrisma();

  const [latest, recent, kpis24h, healthCheck, paymentsSnap, transferSnap] =
    await Promise.all([
    prisma.pipelineRun.findFirst({
      where: { status: { in: ["success", "failed"] } },
      orderBy: { startedAt: "desc" },
    }),
    prisma.pipelineRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 20,
    }),
    getPipelineKpis(24),
    runPipelineHealthCheck(),
    getPaymentsPendingSnapshot(),
    getTransferAssignmentsPendingSnapshot(),
  ]);

  const staleCheck = healthCheck.checks.pipeline_stale;

  const paymentsPending: PaymentsPendingSummary = {
    count: paymentsSnap.count,
    status: paymentsSnap.status,
    oldestOrderId: paymentsSnap.oldestOrderId,
    oldestPaidAt: paymentsSnap.oldestPaidAt,
    lagHours: paymentsSnap.lagHours,
    failThresholdHours: PAYMENTS_PENDING_FAIL_HOURS,
    message: paymentsSnap.message,
  };

  const transferAssignmentsPending: TransferAssignmentsPendingSummary = {
    count: transferSnap.count,
    status: transferSnap.status,
    oldestOrderId: transferSnap.oldestOrderId,
    oldestPaidAt: transferSnap.oldestPaidAt,
    lagHours: transferSnap.lagHours,
    failThresholdHours: TRANSFER_ASSIGNMENTS_FAIL_HOURS,
    message: transferSnap.message,
  };

  return {
    latestRun: latest ? toPipelineRunSummary(latest) : null,
    kpis24h,
    recentRuns: recent.map(toPipelineRunSummary),
    healthCheck,
    pipelineStale: staleCheck ? toPipelineStaleSummary(staleCheck) : null,
    paymentsPending,
    transferAssignmentsPending,
  };
}

async function collectWindowErrors(hours: number): Promise<string[]> {
  const prisma = getPrisma();
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  const failed = await prisma.pipelineRun.findMany({
    where: { startedAt: { gte: since }, status: "failed" },
    select: { failedStage: true, errorsCount: true, id: true },
    take: 10,
  });

  return failed.map(
    (r) => `run ${r.id}: stage=${r.failedStage ?? "unknown"} errors=${r.errorsCount}`
  );
}

export async function generateBurnInReport(): Promise<BurnInReport> {
  const windows: BurnInWindow[] = [];

  for (const hours of [24, 48, 72]) {
    const kpis = await getPipelineKpis(hours);
    const prisma = getPrisma();
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const runs = await prisma.pipelineRun.findMany({
      where: { startedAt: { gte: since }, status: { in: ["success", "failed"] } },
      select: { reportJson: true },
    });

    let projectionPass = 0;
    let driftFailRuns = 0;

    for (const run of runs) {
      const parsed = parseReportJson(run.reportJson);
      if (parsed.projectionStatus === "PASS") projectionPass += 1;
      if (parsed.healthStatus === "FAIL") driftFailRuns += 1;
    }

    windows.push({
      hours,
      kpis,
      projectionPassRate: runs.length ? projectionPass / runs.length : 1,
      driftFailRuns,
      errors: await collectWindowErrors(hours),
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    windows,
  };
}
