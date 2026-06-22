/**
 * M5.4 — Pipeline monitor + scheduler types
 */

import type { LivePipelineReport } from "@/types/erp-v2-live-pipeline";

export const PIPELINE_VERSION = "M5.6";

export type PipelineTrigger = "scheduler" | "manual";

export type PipelineAlertReason =
  | "import_fail"
  | "projection_fail"
  | "pipeline_fail"
  | "unhandled_exception"
  | "drift_detected"
  | "success_rate_low"
  | "pipeline_stale";

export type PipelineAlertPayload = {
  runId: string;
  reason: PipelineAlertReason;
  stage: string;
  occurredAt: string;
  error: string;
  stackSummary: string | null;
  correlationId: string | null;
};

export type MonitoredPipelineResult = {
  runId: string | null;
  lockAcquired: boolean;
  report: LivePipelineReport | null;
  alertSent: boolean;
  alertReason: PipelineAlertReason | null;
  status: "success" | "failed" | "skipped_locked" | "exception";
  error: string | null;
};
