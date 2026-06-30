/**
 * M5.1 — Incremental live import TN → Neon (sin ledger ni snapshot)
 */

import { getPrisma } from "@/lib/db/prisma";
import {
  fetchTnOrdersUpdatedSince,
  tnEnvSummary,
} from "@/lib/erp/v2/tn-api-client";
import {
  mapTnOrderRecord,
  maxTnUpdatedAt,
  mergeRawTnPayloadPaidAt,
  mergeTnPaidAt,
  type TnOrderUpsertRecord,
} from "@/lib/erp/v2/map-tn-order-record";
import {
  applyWatermarkOverlap,
  M5_TN_ORDERS_SYNC_SCOPE,
  M5_WATERMARK_OVERLAP_MS,
  parseTnUpdatedAtFromPayload,
} from "@/lib/erp/v2/tn-sync-watermark";
import type { TnCommercialStatus } from "@/types/erp-v2-api";
import type { Prisma, TnCommercialStatus as PrismaCommercialStatus } from "@prisma/client";

const INVENTORY_SNAPSHOT_SOURCE = "stock_maestro_bootstrap";
const LIVE_IMPORT_SOURCE = "m5_live_import";

export type LiveImportChangeKind =
  | "new"
  | "update"
  | "cancelacion"
  | "refund";

export type LiveImportStats = {
  fetched: number;
  classified: Record<LiveImportChangeKind, number>;
  ordersCreated: number;
  ordersUpdated: number;
  itemsCreated: number;
  itemsReplaced: number;
  itemsSkippedProtected: number;
  commercialStatusChanges: number;
  watermarkBefore: string;
  watermarkQueryFrom: string;
  watermarkAfter: string | null;
  stockLedgerTouched: false;
  snapshotTouched: false;
};

export type LiveImportResult = {
  dryRun: boolean;
  scope: string;
  tnEnv: Record<string, unknown>;
  stats: LiveImportStats;
  samples: Array<{
    tnOrderId: string;
    kind: LiveImportChangeKind;
    commercialStatus: TnCommercialStatus;
    previousCommercialStatus: TnCommercialStatus | null;
    tnUpdatedAt: string | null;
    itemsAction: "create" | "replace" | "skip_protected";
  }>;
  errors: string[];
};

function classifyChange(
  exists: boolean,
  previous: TnCommercialStatus | null | undefined,
  next: TnCommercialStatus
): LiveImportChangeKind {
  if (!exists) return "new";
  if (next === "cancelado" && previous !== "cancelado") return "cancelacion";
  if (next === "reembolsado" && previous !== "reembolsado") return "refund";
  return "update";
}

function toPrismaCommercialStatus(
  status: TnCommercialStatus
): PrismaCommercialStatus {
  return status as PrismaCommercialStatus;
}

function orderWriteData(
  rec: TnOrderUpsertRecord,
  commercialStatusAt: Date | null
): Prisma.TnOrderCreateInput {
  return {
    id: rec.id,
    tnCreatedAt: rec.tnCreatedAt,
    tnPaidAt: rec.tnPaidAt,
    tnUpdatedAt: rec.tnUpdatedAt,
    tnStatus: rec.tnStatus,
    tnPaymentStatus: rec.tnPaymentStatus,
    tnTotal: rec.tnTotal,
    tnSubtotal: rec.tnSubtotal,
    tnShipping: rec.tnShipping,
    tnDiscount: rec.tnDiscount,
    tnAnalyticsCounted: rec.tnAnalyticsCounted,
    tnReportingFlags: rec.tnReportingFlags as Prisma.InputJsonValue,
    rawTnPayload: rec.rawTnPayload as Prisma.InputJsonValue,
    commercialStatus: toPrismaCommercialStatus(rec.commercialStatus),
    commercialStatusAt,
    customerName: rec.customerName,
    customerDni: rec.customerDni,
    customerPhone: rec.customerPhone,
    provinceLocalidad: rec.provinceLocalidad,
    paymentGateway: rec.paymentGateway,
    paymentMethod: rec.paymentMethod,
    shippingOption: rec.shippingOption,
    shippingOwner: rec.shippingOwner,
    syncedAt: new Date(),
  };
}

type ExistingOrderPaidSnapshot = {
  tnPaidAt: Date | null;
  rawTnPayload: unknown;
};

function orderUpdateData(
  rec: TnOrderUpsertRecord,
  opts?: {
    commercialStatusAt?: Date;
    existing?: ExistingOrderPaidSnapshot;
  }
): Prisma.TnOrderUpdateInput {
  const mergedRec: TnOrderUpsertRecord = opts?.existing
    ? {
        ...rec,
        tnPaidAt: mergeTnPaidAt(rec.tnPaidAt, opts.existing.tnPaidAt),
        rawTnPayload: mergeRawTnPayloadPaidAt(
          rec.rawTnPayload,
          opts.existing.rawTnPayload
        ),
      }
    : rec;

  const base = orderWriteData(mergedRec, opts?.commercialStatusAt ?? null);
  const { id: _id, commercialStatusAt: _csa, ...rest } = base;
  const update: Prisma.TnOrderUpdateInput = {
    ...rest,
    syncedAt: new Date(),
  };
  if (opts?.commercialStatusAt) {
    update.commercialStatusAt = opts.commercialStatusAt;
  }
  return update;
}

async function loadBootstrapWatermark(): Promise<Date> {
  const prisma = getPrisma();

  const maxTnUpdated = await prisma.tnOrder.findFirst({
    where: { tnUpdatedAt: { not: null } },
    orderBy: { tnUpdatedAt: "desc" },
    select: { tnUpdatedAt: true },
  });
  if (maxTnUpdated?.tnUpdatedAt) {
    return maxTnUpdated.tnUpdatedAt;
  }

  const rows = await prisma.tnOrder.findMany({
    select: { rawTnPayload: true },
    take: 5000,
  });
  let maxMs = 0;
  for (const row of rows) {
    const raw = row.rawTnPayload as Record<string, unknown> | null;
    const d = parseTnUpdatedAtFromPayload(raw);
    if (d && d.getTime() > maxMs) maxMs = d.getTime();
  }
  if (maxMs > 0) return new Date(maxMs);

  const snapshot = await prisma.inventorySnapshotRun.findFirst({
    where: { isActive: true, source: INVENTORY_SNAPSHOT_SOURCE },
    select: { snapshotDate: true },
  });
  if (snapshot?.snapshotDate) return snapshot.snapshotDate;

  return new Date("2026-04-01T00:00:00.000Z");
}

export async function loadSyncWatermark(): Promise<{
  watermark: Date;
  source: "sync_state" | "bootstrap";
}> {
  const prisma = getPrisma();
  const row = await prisma.syncState.findUnique({
    where: { scope: M5_TN_ORDERS_SYNC_SCOPE },
  });
  if (row?.watermarkAt) {
    return { watermark: row.watermarkAt, source: "sync_state" };
  }
  const bootstrap = await loadBootstrapWatermark();
  return { watermark: bootstrap, source: "bootstrap" };
}

async function replaceOrderItems(
  tnOrderId: string,
  items: TnOrderUpsertRecord["items"]
): Promise<number> {
  const prisma = getPrisma();
  await prisma.tnOrderItem.deleteMany({ where: { tnOrderId } });
  if (!items.length) return 0;
  await prisma.tnOrderItem.createMany({
    data: items.map((it) => ({
      tnOrderId,
      tnLineId: it.tnLineId,
      sku: it.sku,
      productName: it.productName,
      variantName: it.variantName,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      lineTotal: it.lineTotal,
      rawLine: it.rawLine as Prisma.InputJsonValue,
    })),
  });
  return items.length;
}

export async function runIncrementalLiveImport(opts?: {
  dryRun?: boolean;
}): Promise<LiveImportResult> {
  const dryRun = opts?.dryRun ?? true;
  const prisma = getPrisma();
  const errors: string[] = [];
  const samples: LiveImportResult["samples"] = [];

  const { watermark, source: watermarkSource } = await loadSyncWatermark();
  const queryFrom = applyWatermarkOverlap(watermark);

  const stats: LiveImportStats = {
    fetched: 0,
    classified: { new: 0, update: 0, cancelacion: 0, refund: 0 },
    ordersCreated: 0,
    ordersUpdated: 0,
    itemsCreated: 0,
    itemsReplaced: 0,
    itemsSkippedProtected: 0,
    commercialStatusChanges: 0,
    watermarkBefore: watermark.toISOString(),
    watermarkQueryFrom: queryFrom.toISOString(),
    watermarkAfter: null,
    stockLedgerTouched: false,
    snapshotTouched: false,
  };

  let rawOrders;
  try {
    rawOrders = await fetchTnOrdersUpdatedSince({
      updatedAtMin: queryFrom,
      windowLabel: `${watermarkSource}:${queryFrom.toISOString()}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(message);
    return {
      dryRun,
      scope: M5_TN_ORDERS_SYNC_SCOPE,
      tnEnv: tnEnvSummary(),
      stats,
      samples,
      errors,
    };
  }

  const records = rawOrders
    .map((raw) => mapTnOrderRecord(raw))
    .filter((r): r is TnOrderUpsertRecord => r != null);

  const byId = new Map<string, TnOrderUpsertRecord>();
  for (const rec of records) {
    byId.set(rec.id, rec);
  }
  const deduped = [...byId.values()];
  stats.fetched = deduped.length;

  const existingRows = deduped.length
    ? await prisma.tnOrder.findMany({
        where: { id: { in: deduped.map((r) => r.id) } },
        select: {
          id: true,
          commercialStatus: true,
          tnPaidAt: true,
          rawTnPayload: true,
          _count: { select: { itemUnits: true } },
        },
      })
    : [];

  const existingById = new Map(
    existingRows.map((r) => [
      r.id,
      {
        commercialStatus: r.commercialStatus as TnCommercialStatus | null,
        unitCount: r._count.itemUnits,
        tnPaidAt: r.tnPaidAt,
        rawTnPayload: r.rawTnPayload,
      },
    ])
  );

  const now = new Date();
  let nextWatermark = watermark;

  for (const rec of deduped) {
    const prev = existingById.get(rec.id);
    const kind = classifyChange(
      Boolean(prev),
      prev?.commercialStatus,
      rec.commercialStatus
    );
    stats.classified[kind] += 1;

    const statusChanged =
      !prev || prev.commercialStatus !== rec.commercialStatus;
    if (statusChanged) stats.commercialStatusChanges += 1;

    const commercialStatusAt = statusChanged ? now : null;
    const hasUnits = (prev?.unitCount ?? 0) > 0;
    const itemsAction: "create" | "replace" | "skip_protected" = !prev
      ? "create"
      : hasUnits
        ? "skip_protected"
        : "replace";

    if (samples.length < 15) {
      samples.push({
        tnOrderId: rec.id,
        kind,
        commercialStatus: rec.commercialStatus,
        previousCommercialStatus: prev?.commercialStatus ?? null,
        tnUpdatedAt: rec.tnUpdatedAt?.toISOString() ?? null,
        itemsAction,
      });
    }

    if (dryRun) {
      if (!prev) stats.ordersCreated += 1;
      else stats.ordersUpdated += 1;
      if (itemsAction === "create") stats.itemsCreated += rec.items.length;
      else if (itemsAction === "replace") stats.itemsReplaced += rec.items.length;
      else stats.itemsSkippedProtected += 1;
      continue;
    }

    if (!prev) {
      await prisma.tnOrder.create({
        data: orderWriteData(rec, commercialStatusAt ?? now),
      });
      stats.ordersCreated += 1;
      const n = await replaceOrderItems(rec.id, rec.items);
      stats.itemsCreated += n;
    } else {
      await prisma.tnOrder.update({
        where: { id: rec.id },
        data: orderUpdateData(rec, {
          commercialStatusAt: statusChanged ? now : undefined,
          existing: {
            tnPaidAt: prev.tnPaidAt,
            rawTnPayload: prev.rawTnPayload,
          },
        }),
      });
      stats.ordersUpdated += 1;
      if (itemsAction === "replace") {
        const n = await replaceOrderItems(rec.id, rec.items);
        stats.itemsReplaced += n;
      } else {
        stats.itemsSkippedProtected += 1;
      }
    }
  }

  nextWatermark = maxTnUpdatedAt(deduped, watermark);
  stats.watermarkAfter = nextWatermark.toISOString();

  if (!dryRun) {
    await prisma.syncState.upsert({
      where: { scope: M5_TN_ORDERS_SYNC_SCOPE },
      create: {
        scope: M5_TN_ORDERS_SYNC_SCOPE,
        watermarkAt: nextWatermark,
        lastRunAt: now,
        lastRunMode: "write",
        lastRunStats: stats as unknown as Prisma.InputJsonValue,
      },
      update: {
        watermarkAt: nextWatermark,
        lastRunAt: now,
        lastRunMode: "write",
        lastRunStats: stats as unknown as Prisma.InputJsonValue,
      },
    });
  }

  return {
    dryRun,
    scope: M5_TN_ORDERS_SYNC_SCOPE,
    tnEnv: tnEnvSummary(),
    stats,
    samples,
    errors,
  };
}

export function evaluateM52Recommendation(input: {
  dryRun: boolean;
  errors: string[];
  stats: LiveImportStats;
  writeExecuted?: boolean;
}): "GO" | "NO_GO" | "GO_WITH_WARNINGS" {
  if (input.errors.length > 0) return "NO_GO";
  if (!input.dryRun && input.writeExecuted !== true) return "NO_GO";
  if (input.stats.snapshotTouched || input.stats.stockLedgerTouched) {
    return "NO_GO";
  }
  if (input.stats.itemsSkippedProtected > 0) return "GO_WITH_WARNINGS";
  return "GO";
}

export function liveImportOverlapSeconds(): number {
  return Math.round(M5_WATERMARK_OVERLAP_MS / 1000);
}
