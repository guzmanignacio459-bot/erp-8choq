/**
 * M5.6 — Pipeline stale detection (no run in N minutes)
 */

export const PIPELINE_STALE_THRESHOLD_MS = 15 * 60 * 1000;

export const M5_PIPELINE_STALE_ALERT_SCOPE = "m5_pipeline_stale_alert";

/** Minimum interval between stale alert emails */
export const PIPELINE_STALE_ALERT_COOLDOWN_MS = 60 * 60 * 1000;

export type PipelineStaleStatus = {
  stale: boolean;
  thresholdMinutes: number;
  minutesSinceLastRun: number | null;
  lastRunAt: string | null;
  lastRunStatus: string | null;
};

export function computePipelineStale(input: {
  lastRunStartedAt: Date | null;
  lastRunStatus?: string | null;
  now?: Date;
}): PipelineStaleStatus {
  const thresholdMinutes = Math.round(PIPELINE_STALE_THRESHOLD_MS / 60_000);
  const now = input.now ?? new Date();

  if (!input.lastRunStartedAt) {
    return {
      stale: true,
      thresholdMinutes,
      minutesSinceLastRun: null,
      lastRunAt: null,
      lastRunStatus: input.lastRunStatus ?? null,
    };
  }

  const ms = now.getTime() - input.lastRunStartedAt.getTime();
  const minutesSinceLastRun = Math.round(ms / 60_000);

  return {
    stale: ms > PIPELINE_STALE_THRESHOLD_MS,
    thresholdMinutes,
    minutesSinceLastRun,
    lastRunAt: input.lastRunStartedAt.toISOString(),
    lastRunStatus: input.lastRunStatus ?? null,
  };
}
