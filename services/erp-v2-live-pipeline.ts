/**
 * M5.3 — Live pipeline orchestrator (TN-first end-to-end)
 */

import { randomUUID } from "crypto";

import { validateInventoryProjection } from "@/lib/erp/v2/validate-inventory-projection";
import { collectFiOrderIdsFromCommercialResults } from "@/lib/erp/v2/collect-fi-order-ids";
import { runPostT0CommercialAllocationLive } from "@/services/erp-v2-allocations-commercial-live";
import { runPostT0MpAllocationLive } from "@/services/erp-v2-allocations-mp-live";
import { runFinancialItemsSyncForOrders } from "@/services/erp-v2-financial-items-sync-live";
import { runTransferFeeSyncForOrders } from "@/services/financial-items/apply-transfer-fee";
import { runIncrementalLiveImport } from "@/services/erp-v2-live-import";
import { loadProjectionValidationInputs } from "@/services/erp-v2-inventory-projection";
import { runPostT0PaymentSyncLive } from "@/services/erp-v2-payments-sync-live";
import { runPostT0StockLedgerLive } from "@/services/erp-v2-stock-ledger-live";
import { runPostT0UnitExpansionLive } from "@/services/erp-v2-unit-expansion-live";
import type {
  LivePipelineReport,
  PipelineCommercialStage,
  PipelineFinancialItemsStage,
  PipelineImportStage,
  PipelineMpStage,
  PipelinePaymentsStage,
  PipelineProjectionStage,
  PipelineStageStatus,
  PipelineStageTiming,
  PipelineStockStage,
  PipelineUnitsStage,
} from "@/types/erp-v2-live-pipeline";

function skippedStage<T extends PipelineStageTiming>(
  base: Omit<T, "status" | "durationMs" | "startedAt" | "finishedAt">
): T {
  const now = new Date().toISOString();
  return {
    ...base,
    status: "skipped",
    durationMs: 0,
    startedAt: now,
    finishedAt: now,
  } as unknown as T;
}

function timed<T>(
  fn: () => Promise<T>
): Promise<{ result: T; durationMs: number; startedAt: string; finishedAt: string }> {
  const startedAt = new Date();
  return fn().then((result) => {
    const finishedAt = new Date();
    return {
      result,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
    };
  });
}

async function runProjectionStage(): Promise<{
  stage: PipelineProjectionStage;
  critical: boolean;
}> {
  const { result, durationMs, startedAt, finishedAt } = await timed(async () => {
    const inputs = await loadProjectionValidationInputs();
    const validation = validateInventoryProjection({
      snapshotLines: inputs.snapshotLines,
      movements: inputs.movements,
      projectionRows: inputs.rows,
      movementsPostT0: inputs.movementsPostT0,
    });
    return { inputs, validation };
  });

  const { inputs, validation } = result;
  const stage: PipelineProjectionStage = {
    status: validation.vI4.pass ? "ok" : "failed",
    durationMs,
    startedAt,
    finishedAt,
    snapshotQtyTotal: inputs.totals.snapshotQuantityTotal,
    movementDeltaTotal: inputs.totals.netDeltaTotal,
    projectedQtyTotal: inputs.totals.projectedQuantityTotal,
    movementsPostT0: inputs.movementsPostT0,
    projectionRowCount: inputs.rows.length,
    vI3: validation.vI3.pass,
    vI4: validation.vI4.pass,
    vI5: validation.vI5.pass,
    checksumMatch: inputs.snapshot.checksumSha256 != null,
  };

  return { stage, critical: !validation.vI4.pass };
}

export async function runLivePipeline(opts?: {
  dryRun?: boolean;
  reportOnly?: boolean;
  correlationId?: string;
}): Promise<LivePipelineReport> {
  const dryRun = opts?.dryRun ?? true;
  const reportOnly = opts?.reportOnly ?? false;
  const mode = reportOnly ? "report-only" : dryRun ? "dry-run" : "write";
  const correlationId = opts?.correlationId ?? `m5.3-pipeline-${randomUUID()}`;

  const pipelineStarted = new Date();
  const warnings: string[] = [];
  const errors: string[] = [];
  let failedStage: string | null = null;
  let stop = false;

  const emptyImport = skippedStage<PipelineImportStage>({
    fetched: 0,
    ordersCreated: 0,
    ordersUpdated: 0,
    classified: { new: 0, update: 0, cancelacion: 0, refund: 0 },
    itemsSkippedProtected: 0,
    watermarkAfter: null,
    errors: [],
  });

  const emptyUnits = skippedStage<PipelineUnitsStage>({
    postT0Orders: 0,
    pendingLines: 0,
    unitsCreated: 0,
    ordersTouched: 0,
    qtyParityPass: true,
    errors: [],
  });

  const emptyCommercial = skippedStage<PipelineCommercialStage>({
    ordersProcessed: 0,
    ordersSkipped: 0,
    ordersFailed: 0,
    allocationsCreated: 0,
    validationChecks: {},
    errors: [],
  });

  const emptyPayments = skippedStage<PipelinePaymentsStage>({
    ordersPending: 0,
    ordersProcessed: 0,
    paymentsCreated: 0,
    paymentsUpdated: 0,
    paymentsSkipped: 0,
    ordersFailed: 0,
    syncedOrderIds: [],
    errors: [],
  });

  const emptyMp = skippedStage<PipelineMpStage>({
    ordersProcessed: 0,
    ordersSkipped: 0,
    ordersFailed: 0,
    allocationsEnriched: 0,
    validationChecks: {},
    errors: [],
  });

  const emptyFinancialItems = skippedStage<PipelineFinancialItemsStage>({
    ordersRequested: 0,
    ordersProcessed: 0,
    itemsUpdated: 0,
    itemsCreated: 0,
    errors: [],
  });

  const emptyStock = skippedStage<PipelineStockStage>({
    ordersProcessed: 0,
    ordersSkipped: 0,
    ordersFailed: 0,
    movementsCreated: 0,
    unitsSkippedNonStockable: 0,
    validationChecks: {},
    errors: [],
  });

  let importStage = emptyImport;
  let unitsStage = emptyUnits;
  let commercialStage = emptyCommercial;
  let paymentsStage = emptyPayments;
  let mpStage = emptyMp;
  let financialItemsStage = emptyFinancialItems;
  let stockStage = emptyStock;
  let projectionStage = skippedStage<PipelineProjectionStage>({
    snapshotQtyTotal: 0,
    movementDeltaTotal: 0,
    projectedQtyTotal: 0,
    movementsPostT0: 0,
    projectionRowCount: 0,
    vI3: false,
    vI4: false,
    vI5: false,
    checksumMatch: false,
  });

  if (!reportOnly) {
    const fiOrderIds = new Set<string>();

    // Stage 1 — Import
    {
      const { result, durationMs, startedAt, finishedAt } = await timed(() =>
        runIncrementalLiveImport({ dryRun })
      );
      const status: PipelineStageStatus =
        result.errors.length > 0 ? "failed" : "ok";
      importStage = {
        status,
        durationMs,
        startedAt,
        finishedAt,
        fetched: result.stats.fetched,
        ordersCreated: result.stats.ordersCreated,
        ordersUpdated: result.stats.ordersUpdated,
        classified: result.stats.classified,
        itemsSkippedProtected: result.stats.itemsSkippedProtected,
        watermarkAfter: result.stats.watermarkAfter,
        errors: result.errors,
      };
      if (result.stats.itemsSkippedProtected > 0) {
        warnings.push(
          `import: ${result.stats.itemsSkippedProtected} orders with items skip protected`
        );
      }
      if (status === "failed") {
        failedStage = "import";
        errors.push(...result.errors);
        stop = true;
      }
    }

    // Stage 2 — Units
    if (!stop) {
      const { result, durationMs, startedAt, finishedAt } = await timed(() =>
        runPostT0UnitExpansionLive({ dryRun })
      );
      const status: PipelineStageStatus =
        result.errors.length > 0 ||
        (!dryRun && !result.stats.qtyParityPass)
          ? "failed"
          : "ok";
      unitsStage = {
        status,
        durationMs,
        startedAt,
        finishedAt,
        postT0Orders: result.stats.postT0OrdersScanned,
        pendingLines: result.stats.pendingLines,
        unitsCreated: dryRun
          ? result.stats.expectedNewUnits
          : result.stats.unitsCreated,
        ordersTouched: result.stats.ordersTouched,
        qtyParityPass: result.stats.qtyParityPass,
        errors: result.errors,
      };
      if (status === "failed") {
        failedStage = "units";
        errors.push(...result.errors);
        if (!dryRun && !result.stats.qtyParityPass) {
          errors.push("units: qty parity failed");
        }
        stop = true;
      }
    }

    // Stage 3 — Commercial
    if (!stop) {
      const { result, durationMs, startedAt, finishedAt } = await timed(() =>
        runPostT0CommercialAllocationLive({ dryRun })
      );
      const status: PipelineStageStatus =
        result.errors.length > 0 || result.stats.ordersFailed > 0
          ? "failed"
          : "ok";
      commercialStage = {
        status,
        durationMs,
        startedAt,
        finishedAt,
        ordersProcessed: result.stats.ordersProcessed,
        ordersSkipped: result.stats.ordersSkipped,
        ordersFailed: result.stats.ordersFailed,
        allocationsCreated: result.stats.allocationsCreated,
        validationChecks: result.stats.validationChecks,
        errors: result.errors,
      };
      for (const tnOrderId of collectFiOrderIdsFromCommercialResults(
        result.orderResults
      )) {
        fiOrderIds.add(tnOrderId);
      }
      if (status === "failed") {
        failedStage = "commercial";
        errors.push(...result.errors);
        stop = true;
      }
    }

    // Stage 4 — Payment sync (M6.3.3)
    if (!stop) {
      const { result, durationMs, startedAt, finishedAt } = await timed(() =>
        runPostT0PaymentSyncLive({ dryRun })
      );
      const status: PipelineStageStatus =
        result.errors.length > 0 ? "failed" : "ok";
      paymentsStage = {
        status,
        durationMs,
        startedAt,
        finishedAt,
        ordersPending: result.stats.ordersPending,
        ordersProcessed: result.stats.ordersProcessed,
        paymentsCreated: result.stats.paymentsCreated,
        paymentsUpdated: result.stats.paymentsUpdated,
        paymentsSkipped: result.stats.paymentsSkipped,
        ordersFailed: result.stats.ordersFailed,
        syncedOrderIds: result.stats.syncedOrderIds,
        errors: result.errors,
      };
      for (const id of result.stats.syncedOrderIds) {
        fiOrderIds.add(id);
      }
      if (result.stats.ordersFailed > 0) {
        warnings.push(
          `payments: ${result.stats.ordersFailed} orders failed MP sync`
        );
      }
      if (status === "failed") {
        failedStage = "payments";
        errors.push(...result.errors);
        stop = true;
      }
    }

    // Stage 5 — MP allocation
    if (!stop) {
      const { result, durationMs, startedAt, finishedAt } = await timed(() =>
        runPostT0MpAllocationLive({ dryRun })
      );
      const status: PipelineStageStatus =
        result.errors.length > 0 || result.stats.ordersFailed > 0
          ? "failed"
          : "ok";
      mpStage = {
        status,
        durationMs,
        startedAt,
        finishedAt,
        ordersProcessed: result.stats.ordersProcessed,
        ordersSkipped: result.stats.ordersSkipped,
        ordersFailed: result.stats.ordersFailed,
        allocationsEnriched: result.stats.allocationsEnriched,
        validationChecks: result.stats.validationChecks,
        errors: result.errors,
      };
      for (const item of result.orderResults) {
        if (item.ok && !item.skipped) {
          fiOrderIds.add(item.tnOrderId);
        }
      }
      if (status === "failed") {
        failedStage = "mp";
        errors.push(...result.errors);
        stop = true;
      }
    }

    // Stage 6 — Financial items refresh (orders touched this run)
    if (!stop) {
      const orderIds = [...fiOrderIds];
      const { result, durationMs, startedAt, finishedAt } = await timed(() =>
        runFinancialItemsSyncForOrders(orderIds, { dryRun })
      );
      const status: PipelineStageStatus =
        result.errors.length > 0 ? "failed" : "ok";
      financialItemsStage = {
        status,
        durationMs,
        startedAt,
        finishedAt,
        ordersRequested: result.stats.ordersRequested,
        ordersProcessed: result.stats.ordersProcessed,
        itemsUpdated: result.stats.itemsUpdated,
        itemsCreated: result.stats.itemsCreated,
        errors: result.errors,
      };
      if (result.errors.length > 0) {
        warnings.push(`financial_items: ${result.errors.length} order errors`);
      }
      if (status === "failed") {
        failedStage = "financial_items";
        errors.push(...result.errors);
        stop = true;
      } else if (!dryRun && orderIds.length > 0) {
        const tfResult = await runTransferFeeSyncForOrders(orderIds, {
          dryRun: false,
        });
        if (tfResult.errors.length > 0) {
          warnings.push(
            `transfer_fee: ${tfResult.errors.length} order errors`
          );
        }
      }
    }

    // Stage 7 — Stock
    if (!stop) {
      const { result, durationMs, startedAt, finishedAt } = await timed(() =>
        runPostT0StockLedgerLive({
          dryRun,
          correlationId,
          runProjectionVerify: false,
        })
      );
      const status: PipelineStageStatus =
        result.errors.length > 0 || result.stats.ordersFailed > 0
          ? "failed"
          : "ok";
      stockStage = {
        status,
        durationMs,
        startedAt,
        finishedAt,
        ordersProcessed: result.stats.ordersProcessed,
        ordersSkipped: result.stats.ordersSkipped,
        ordersFailed: result.stats.ordersFailed,
        movementsCreated: result.stats.movementsCreated,
        unitsSkippedNonStockable: result.stats.unitsSkippedNonStockable,
        validationChecks: result.stats.validationChecks,
        errors: result.errors,
      };
      if (result.stats.unitsSkippedNonStockable > 0) {
        warnings.push(
          `stock: ${result.stats.unitsSkippedNonStockable} non-stockable units skipped`
        );
      }
      if (status === "failed") {
        failedStage = "stock";
        errors.push(...result.errors);
        stop = true;
      }
    }
  }

  // Stage 8 — Projection (always when not stopped, or report-only)
  if (!stop || reportOnly) {
    const { stage, critical } = await runProjectionStage();
    projectionStage = stage;
    if (critical) {
      failedStage = failedStage ?? "projection";
      errors.push("projection: V-I4 failed");
    }
  }

  const pipelineFinished = new Date();
  const idempotent =
    !reportOnly &&
    importStage.fetched === 0 &&
    unitsStage.unitsCreated === 0 &&
    commercialStage.allocationsCreated === 0 &&
    paymentsStage.paymentsCreated === 0 &&
    paymentsStage.paymentsUpdated === 0 &&
    mpStage.allocationsEnriched === 0 &&
    financialItemsStage.itemsUpdated === 0 &&
    financialItemsStage.itemsCreated === 0 &&
    stockStage.movementsCreated === 0;

  const p4 = projectionStage.vI4;
  const success =
    errors.length === 0 && p4 && failedStage === null;

  return {
    milestone: "M6.3.3",
    mode,
    startedAt: pipelineStarted.toISOString(),
    finishedAt: pipelineFinished.toISOString(),
    durationMs: pipelineFinished.getTime() - pipelineStarted.getTime(),
    correlationId,
    import: importStage,
    units: unitsStage,
    commercial: commercialStage,
    payments: paymentsStage,
    mp: mpStage,
    financialItems: financialItemsStage,
    stock: stockStage,
    projection: projectionStage,
    validations: {
      p1_stageOrder: true,
      p2_stopOnFailure: failedStage != null ? stop || reportOnly : true,
      p3_idempotent: reportOnly ? null : idempotent,
      p4_projectionPass: p4,
    },
    success,
    failedStage,
    warnings,
    errors,
  };
}

export function evaluatePipelineGo(report: LivePipelineReport): "GO" | "NO_GO" | "GO_WITH_WARNINGS" {
  if (!report.success) return "NO_GO";
  if (report.warnings.length > 0) return "GO_WITH_WARNINGS";
  return "GO";
}
