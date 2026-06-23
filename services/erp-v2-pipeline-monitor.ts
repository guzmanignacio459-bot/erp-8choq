/**
 * M5.4 — Pipeline monitor: lock, run logging, failure alerts
 */

import { randomUUID } from "crypto";

import {
  buildPipelineAlertPayload,
  sendPipelineAlertEmail,
} from "@/lib/erp/v2/pipeline-alert-email";
import { withPipelineLock } from "@/lib/erp/v2/pipeline-lock";
import { getPrisma } from "@/lib/db/prisma";
import { runLivePipeline } from "@/services/erp-v2-live-pipeline";
import {
  getPipelineKpis,
  runPipelineHealthCheck,
} from "@/services/erp-v2-pipeline-health";
import type { LivePipelineReport } from "@/types/erp-v2-live-pipeline";
import type { PipelineHealthCheck } from "@/types/erp-v2-pipeline-health";
import type {
  MonitoredPipelineResult,
  PipelineAlertReason,
  PipelineTrigger,
} from "@/types/erp-v2-pipeline-monitor";
import { PIPELINE_VERSION } from "@/types/erp-v2-pipeline-monitor";
import type { PipelineRunStatus, Prisma } from "@prisma/client";
import { Prisma as PrismaNamespace } from "@prisma/client";

function ordersImportedFromReport(report: LivePipelineReport): number {
  return report.import.ordersCreated + report.import.ordersUpdated;
}

function resolveAlertReason(
  report: LivePipelineReport,
  healthCheck?: PipelineHealthCheck
): PipelineAlertReason | null {
  if (report.import.status === "failed") return "import_fail";
  if (!report.projection.vI4 || report.projection.status === "failed") {
    return "projection_fail";
  }
  if (!report.success) return "pipeline_fail";
  if (healthCheck?.overall === "FAIL") return "drift_detected";
  return null;
}

function resolveAlertStage(
  report: LivePipelineReport,
  reason: PipelineAlertReason
): string {
  if (reason === "import_fail") return "import";
  if (reason === "projection_fail") return "projection";
  if (reason === "drift_detected") return "drift";
  if (reason === "success_rate_low") return "monitoring";
  return report.failedStage ?? "pipeline";
}

function resolveAlertError(
  report: LivePipelineReport,
  reason: PipelineAlertReason,
  healthCheck?: PipelineHealthCheck
): string {
  if (reason === "import_fail") {
    return report.import.errors.join("; ") || "import stage failed";
  }
  if (reason === "projection_fail") {
    return "projection: V-I4 failed";
  }
  if (reason === "drift_detected" && healthCheck) {
    const failed = Object.values(healthCheck.checks)
      .filter((c) => !c.pass)
      .map((c) => `${c.id}: ${c.message}`);
    return failed.join("; ") || "drift detected";
  }
  if (reason === "success_rate_low") {
    return "success rate below 95% in last 24h";
  }
  return report.errors.join("; ") || "pipeline failed";
}

type StoredPipelineReport = LivePipelineReport & {
  healthCheck: PipelineHealthCheck;
};

async function createRunningRun(input: {
  triggeredBy: PipelineTrigger;
  correlationId: string;
}): Promise<string> {
  const prisma = getPrisma();
  const row = await prisma.pipelineRun.create({
    data: {
      startedAt: new Date(),
      status: "running",
      pipelineVersion: PIPELINE_VERSION,
      triggeredBy: input.triggeredBy,
      correlationId: input.correlationId,
    },
    select: { id: true },
  });
  return row.id;
}

async function finalizeRun(
  runId: string,
  input: {
    status: PipelineRunStatus;
    report: StoredPipelineReport | null;
    alertEmailSent: boolean;
    finishedAt: Date;
    durationMs: number;
  }
): Promise<void> {
  const prisma = getPrisma();
  const report = input.report;

  await prisma.pipelineRun.update({
    where: { id: runId },
    data: {
      finishedAt: input.finishedAt,
      durationMs: input.durationMs,
      status: input.status,
      ordersImported: report ? ordersImportedFromReport(report) : 0,
      unitsCreated: report?.units.unitsCreated ?? 0,
      commercialAllocationsCreated:
        report?.commercial.allocationsCreated ?? 0,
      mpAllocationsCreated: report?.mp.allocationsEnriched ?? 0,
      stockMovementsCreated: report?.stock.movementsCreated ?? 0,
      warningsCount: report?.warnings.length ?? 0,
      errorsCount: report?.errors.length ?? (input.status === "failed" ? 1 : 0),
      failedStage: report?.failedStage ?? null,
      reportJson: report
        ? (report as unknown as Prisma.InputJsonValue)
        : PrismaNamespace.JsonNull,
      alertEmailSent: input.alertEmailSent,
    },
  });
}

async function recordSkippedLocked(
  triggeredBy: PipelineTrigger
): Promise<string> {
  const prisma = getPrisma();
  const now = new Date();
  const row = await prisma.pipelineRun.create({
    data: {
      startedAt: now,
      finishedAt: now,
      durationMs: 0,
      status: "skipped_locked",
      pipelineVersion: PIPELINE_VERSION,
      triggeredBy,
    },
    select: { id: true },
  });
  return row.id;
}

async function maybeSendFailureAlert(input: {
  runId: string;
  report: StoredPipelineReport;
  kpis24h: Awaited<ReturnType<typeof getPipelineKpis>>;
}): Promise<{ sent: boolean; reason: PipelineAlertReason | null }> {
  const { report, kpis24h } = input;
  const healthCheck = report.healthCheck;

  let alertReason = resolveAlertReason(report, healthCheck);

  if (
    !alertReason &&
    kpis24h.totalRuns >= 5 &&
    kpis24h.successRate < 0.95
  ) {
    alertReason = "success_rate_low";
  }

  if (!alertReason) {
    return { sent: false, reason: null };
  }

  const payload = buildPipelineAlertPayload({
    runId: input.runId,
    reason: alertReason,
    stage: resolveAlertStage(report, alertReason),
    error: resolveAlertError(report, alertReason, healthCheck),
    correlationId: report.correlationId,
  });

  const email = await sendPipelineAlertEmail(payload);
  return { sent: email.sent, reason: alertReason };
}

export async function executeMonitoredPipeline(opts?: {
  triggeredBy?: PipelineTrigger;
  dryRun?: boolean;
}): Promise<MonitoredPipelineResult> {
  const triggeredBy = opts?.triggeredBy ?? "scheduler";
  const dryRun = opts?.dryRun ?? false;
  const correlationId = `m5.4-pipeline-${randomUUID()}`;

  const { acquired, result } = await withPipelineLock(async () => {
    const runId = await createRunningRun({ triggeredBy, correlationId });
    const started = Date.now();

    try {
      const report = await runLivePipeline({
        dryRun,
        correlationId,
      });

      const healthCheck = await runPipelineHealthCheck();
      const enrichedReport: StoredPipelineReport = { ...report, healthCheck };
      const kpis24h = await getPipelineKpis(24);
      const alert = await maybeSendFailureAlert({
        runId,
        report: enrichedReport,
        kpis24h,
      });
      const finishedAt = new Date();
      const durationMs = finishedAt.getTime() - started;

      const runStatus =
        report.success && healthCheck.overall !== "FAIL" ? "success" : "failed";

      await finalizeRun(runId, {
        status: runStatus,
        report: enrichedReport,
        alertEmailSent: alert.sent,
        finishedAt,
        durationMs,
      });

      return {
        runId,
        lockAcquired: true,
        report: enrichedReport,
        alertSent: alert.sent,
        alertReason: alert.reason,
        status: runStatus === "success" ? ("success" as const) : ("failed" as const),
        error:
          runStatus === "success"
            ? null
            : report.errors.join("; ") ||
              `health: ${healthCheck.overall}`,
      };
    } catch (err) {
      const finishedAt = new Date();
      const durationMs = finishedAt.getTime() - started;
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;

      const payload = buildPipelineAlertPayload({
        runId,
        reason: "unhandled_exception",
        stage: "exception",
        error: message,
        stack,
        correlationId,
      });
      const email = await sendPipelineAlertEmail(payload);

      await finalizeRun(runId, {
        status: "failed",
        report: null,
        alertEmailSent: email.sent,
        finishedAt,
        durationMs,
      });

      return {
        runId,
        lockAcquired: true,
        report: null,
        alertSent: email.sent,
        alertReason: "unhandled_exception" as const,
        status: "exception" as const,
        error: message,
      };
    }
  });

  if (!acquired) {
    const runId = await recordSkippedLocked(triggeredBy);
    return {
      runId,
      lockAcquired: false,
      report: null,
      alertSent: false,
      alertReason: null,
      status: "skipped_locked",
      error: null,
    };
  }

  return result!;
}

export async function getRecentPipelineRuns(limit = 20) {
  const prisma = getPrisma();
  return prisma.pipelineRun.findMany({
    orderBy: { startedAt: "desc" },
    take: limit,
  });
}

export async function getRunningPipelineRun() {
  const prisma = getPrisma();
  return prisma.pipelineRun.findFirst({
    where: { status: "running" },
    orderBy: { startedAt: "desc" },
  });
}
