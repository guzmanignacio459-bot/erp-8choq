/**
 * M5.6 — Stale pipeline alert (email + dedup via sync_state)
 */

import {
  buildPipelineAlertPayload,
  sendPipelineAlertEmail,
} from "@/lib/erp/v2/pipeline-alert-email";
import {
  computePipelineStale,
  M5_PIPELINE_STALE_ALERT_SCOPE,
  PIPELINE_STALE_ALERT_COOLDOWN_MS,
} from "@/lib/erp/v2/pipeline-stale";
import { getPrisma } from "@/lib/db/prisma";
import type { PipelineStaleStatus } from "@/lib/erp/v2/pipeline-stale";
import type { DriftCheckResult } from "@/types/erp-v2-pipeline-health";

export async function loadLatestPipelineRunStartedAt(): Promise<{
  startedAt: Date | null;
  status: string | null;
  runId: string | null;
}> {
  const prisma = getPrisma();
  const row = await prisma.pipelineRun.findFirst({
    where: {
      status: { in: ["success", "failed", "skipped_locked", "running"] },
    },
    orderBy: { startedAt: "desc" },
    select: { id: true, startedAt: true, status: true },
  });

  return {
    startedAt: row?.startedAt ?? null,
    status: row?.status ?? null,
    runId: row?.id ?? null,
  };
}

export async function checkPipelineStaleDrift(): Promise<DriftCheckResult> {
  const latest = await loadLatestPipelineRunStartedAt();
  const status = computePipelineStale({
    lastRunStartedAt: latest.startedAt,
    lastRunStatus: latest.status,
  });

  return {
    id: "pipeline_stale",
    pass: !status.stale,
    message: status.stale
      ? status.lastRunAt
        ? `pipeline stale: última corrida hace ${status.minutesSinceLastRun} min (umbral ${status.thresholdMinutes} min)`
        : `pipeline stale: sin corridas registradas (umbral ${status.thresholdMinutes} min)`
      : `pipeline activo: última corrida hace ${status.minutesSinceLastRun} min`,
    details: {
      stale: status.stale,
      thresholdMinutes: status.thresholdMinutes,
      minutesSinceLastRun: status.minutesSinceLastRun,
      lastRunAt: status.lastRunAt,
      lastRunStatus: status.lastRunStatus,
      lastRunId: latest.runId,
    },
  };
}

async function shouldSendStaleAlert(now: Date): Promise<boolean> {
  const prisma = getPrisma();
  const row = await prisma.syncState.findUnique({
    where: { scope: M5_PIPELINE_STALE_ALERT_SCOPE },
    select: { watermarkAt: true },
  });
  if (!row?.watermarkAt) return true;
  return (
    now.getTime() - row.watermarkAt.getTime() >= PIPELINE_STALE_ALERT_COOLDOWN_MS
  );
}

async function recordStaleAlertSent(at: Date): Promise<void> {
  const prisma = getPrisma();
  await prisma.syncState.upsert({
    where: { scope: M5_PIPELINE_STALE_ALERT_SCOPE },
    create: {
      scope: M5_PIPELINE_STALE_ALERT_SCOPE,
      watermarkAt: at,
      lastRunAt: at,
      lastRunMode: "alert",
    },
    update: {
      watermarkAt: at,
      lastRunAt: at,
      lastRunMode: "alert",
    },
  });
}

export type StalePipelineAlertResult = {
  stale: PipelineStaleStatus;
  emailSent: boolean;
  emailSkipped: boolean;
  emailReason: string | null;
  dryRun: boolean;
};

export async function maybeSendStalePipelineAlert(opts?: {
  dryRun?: boolean;
}): Promise<StalePipelineAlertResult> {
  const dryRun = opts?.dryRun ?? false;
  const drift = await checkPipelineStaleDrift();
  const stale = computePipelineStale({
    lastRunStartedAt: drift.details.lastRunAt
      ? new Date(String(drift.details.lastRunAt))
      : null,
    lastRunStatus:
      typeof drift.details.lastRunStatus === "string"
        ? drift.details.lastRunStatus
        : null,
  });

  if (!stale.stale) {
    return {
      stale,
      emailSent: false,
      emailSkipped: true,
      emailReason: "pipeline not stale",
      dryRun,
    };
  }

  if (dryRun) {
    return {
      stale,
      emailSent: false,
      emailSkipped: true,
      emailReason: "dry-run",
      dryRun,
    };
  }

  const now = new Date();
  const canSend = await shouldSendStaleAlert(now);
  if (!canSend) {
    return {
      stale,
      emailSent: false,
      emailSkipped: true,
      emailReason: "cooldown active",
      dryRun,
    };
  }

  const runId =
    typeof drift.details.lastRunId === "string"
      ? drift.details.lastRunId
      : "no-run";

  const payload = buildPipelineAlertPayload({
    runId,
    reason: "pipeline_stale",
    stage: "monitoring",
    error: drift.message,
  });

  const email = await sendPipelineAlertEmail(payload);
  if (email.sent) {
    await recordStaleAlertSent(now);
  }

  return {
    stale,
    emailSent: email.sent,
    emailSkipped: email.skipped,
    emailReason: email.reason,
    dryRun,
  };
}
