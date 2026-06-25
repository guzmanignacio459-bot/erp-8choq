/**
 * M5.3 — Live pipeline orchestrator report types
 */

export type PipelineStageStatus = "ok" | "failed" | "skipped";

export type PipelineStageTiming = {
  status: PipelineStageStatus;
  durationMs: number;
  startedAt: string;
  finishedAt: string;
};

export type PipelineImportStage = PipelineStageTiming & {
  fetched: number;
  ordersCreated: number;
  ordersUpdated: number;
  classified: {
    new: number;
    update: number;
    cancelacion: number;
    refund: number;
  };
  itemsSkippedProtected: number;
  watermarkAfter: string | null;
  errors: string[];
};

export type PipelineUnitsStage = PipelineStageTiming & {
  postT0Orders: number;
  pendingLines: number;
  unitsCreated: number;
  ordersTouched: number;
  qtyParityPass: boolean;
  errors: string[];
};

export type PipelineCommercialStage = PipelineStageTiming & {
  ordersProcessed: number;
  ordersSkipped: number;
  ordersFailed: number;
  allocationsCreated: number;
  validationChecks: Record<string, string>;
  errors: string[];
};

export type PipelineMpStage = PipelineStageTiming & {
  ordersProcessed: number;
  ordersSkipped: number;
  ordersFailed: number;
  allocationsEnriched: number;
  validationChecks: Record<string, string>;
  errors: string[];
};

export type PipelinePaymentsStage = PipelineStageTiming & {
  ordersPending: number;
  ordersProcessed: number;
  paymentsCreated: number;
  paymentsUpdated: number;
  paymentsSkipped: number;
  ordersFailed: number;
  syncedOrderIds: string[];
  errors: string[];
};

export type PipelineFinancialItemsStage = PipelineStageTiming & {
  ordersRequested: number;
  ordersProcessed: number;
  itemsUpdated: number;
  itemsCreated: number;
  errors: string[];
};

export type PipelineStockStage = PipelineStageTiming & {
  ordersProcessed: number;
  ordersSkipped: number;
  ordersFailed: number;
  movementsCreated: number;
  unitsSkippedNonStockable: number;
  validationChecks: Record<string, string>;
  errors: string[];
};

export type PipelineProjectionStage = PipelineStageTiming & {
  snapshotQtyTotal: number;
  movementDeltaTotal: number;
  projectedQtyTotal: number;
  movementsPostT0: number;
  projectionRowCount: number;
  vI3: boolean;
  vI4: boolean;
  vI5: boolean;
  checksumMatch: boolean;
};

export type LivePipelineReport = {
  milestone: "M6.3.3";
  mode: "dry-run" | "write" | "report-only";
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  correlationId: string;
  import: PipelineImportStage;
  units: PipelineUnitsStage;
  commercial: PipelineCommercialStage;
  payments: PipelinePaymentsStage;
  mp: PipelineMpStage;
  financialItems: PipelineFinancialItemsStage;
  stock: PipelineStockStage;
  projection: PipelineProjectionStage;
  validations: {
    p1_stageOrder: boolean;
    p2_stopOnFailure: boolean;
    p3_idempotent: boolean | null;
    p4_projectionPass: boolean;
  };
  success: boolean;
  failedStage: string | null;
  warnings: string[];
  errors: string[];
};
