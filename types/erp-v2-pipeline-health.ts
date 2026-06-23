/**
 * M5.5 — Pipeline health, drift detection, burn-in types
 */

export type HealthCheckStatus = "PASS" | "WARNING" | "FAIL";

export type DriftCheckId =
  | "projection"
  | "units"
  | "commercial"
  | "stock"
  | "mp"
  | "pipeline_stale";

export type DriftCheckResult = {
  id: DriftCheckId;
  pass: boolean;
  message: string;
  details: Record<string, number | string | boolean | null>;
};

export type PipelineHealthCheck = {
  checkedAt: string;
  overall: HealthCheckStatus;
  checks: Record<DriftCheckId, DriftCheckResult>;
  driftDetected: boolean;
};

export type PipelineKpis = {
  windowHours: number;
  totalRuns: number;
  successRuns: number;
  failedRuns: number;
  successRate: number;
  avgDurationMs: number;
  maxDurationMs: number;
  ordersImported: number;
  warningsCount: number;
};

export type BurnInWindow = {
  hours: number;
  kpis: PipelineKpis;
  projectionPassRate: number;
  driftFailRuns: number;
  errors: string[];
};

export type BurnInReport = {
  generatedAt: string;
  windows: BurnInWindow[];
};

export type EnrichedPipelineReport = {
  healthCheck: PipelineHealthCheck;
};

export type PipelineRunSummary = {
  id: string;
  startedAt: string;
  finishedAt: string | null;
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
  projectionStatus: string | null;
  healthStatus: HealthCheckStatus | null;
};

export type PipelineStaleSummary = {
  stale: boolean;
  thresholdMinutes: number;
  minutesSinceLastRun: number | null;
  lastRunAt: string | null;
  lastRunStatus: string | null;
};

export type PipelineSystemHealthResponse = {
  ok: boolean;
  fetchedAt: string;
  latestRun: PipelineRunSummary | null;
  kpis24h: PipelineKpis;
  recentRuns: PipelineRunSummary[];
  healthCheck: PipelineHealthCheck | null;
  pipelineStale: PipelineStaleSummary | null;
  error?: string;
};
