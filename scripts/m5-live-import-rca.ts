#!/usr/bin/env npx tsx
/**
 * M5.5.2 RCA — read-only diagnostic (no writes)
 */
import {
  applyWatermarkOverlap,
  M5_TN_ORDERS_SYNC_SCOPE,
} from "../lib/erp/v2/tn-sync-watermark";
import {
  fetchTnOrdersUpdatedSince,
  tnFetch,
} from "../lib/erp/v2/tn-api-client";
import { mapTnOrderRecord } from "../lib/erp/v2/map-tn-order-record";
import { loadSyncWatermark } from "../services/erp-v2-live-import";
import { getPrisma } from "../lib/db/prisma";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { loadEnvLocal } = require("./lib/l0-env.mjs");

loadEnvLocal();

async function main() {
  const prisma = getPrisma();

  const totalNeon = await prisma.tnOrder.count();
  const lastByUpdated = await prisma.tnOrder.findFirst({
    where: { tnUpdatedAt: { not: null } },
    orderBy: { tnUpdatedAt: "desc" },
    select: {
      id: true,
      tnUpdatedAt: true,
      tnCreatedAt: true,
      tnPaidAt: true,
      syncedAt: true,
      commercialStatus: true,
    },
  });
  const lastByCreated = await prisma.tnOrder.findFirst({
    where: { tnCreatedAt: { not: null } },
    orderBy: { tnCreatedAt: "desc" },
    select: { id: true, tnCreatedAt: true, tnUpdatedAt: true, tnPaidAt: true },
  });
  const lastByPaid = await prisma.tnOrder.findFirst({
    where: { tnPaidAt: { not: null } },
    orderBy: { tnPaidAt: "desc" },
    select: { id: true, tnPaidAt: true, tnCreatedAt: true, tnUpdatedAt: true },
  });

  const june8 = new Date("2026-06-08T23:59:59.999Z");
  const afterJune8Created = await prisma.tnOrder.count({
    where: { tnCreatedAt: { gt: june8 } },
  });
  const afterJune8Paid = await prisma.tnOrder.count({
    where: { tnPaidAt: { gt: june8 } },
  });

  const recentNeon = await prisma.tnOrder.findMany({
    where: { tnCreatedAt: { gt: new Date("2026-06-01T00:00:00Z") } },
    orderBy: { tnCreatedAt: "desc" },
    take: 20,
    select: {
      id: true,
      tnCreatedAt: true,
      tnUpdatedAt: true,
      tnPaidAt: true,
      syncedAt: true,
      commercialStatus: true,
    },
  });

  const syncState = await prisma.syncState.findUnique({
    where: { scope: M5_TN_ORDERS_SYNC_SCOPE },
  });

  const { watermark, source } = await loadSyncWatermark();
  const queryFrom = applyWatermarkOverlap(watermark);

  const runs = await prisma.pipelineRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 50,
    select: {
      id: true,
      startedAt: true,
      status: true,
      ordersImported: true,
      warningsCount: true,
      errorsCount: true,
      reportJson: true,
    },
  });

  console.log("\n=== 1. NEON vs TN ===");
  console.log(
    JSON.stringify(
      {
        neonTotal: totalNeon,
        neonAfterJune8Created: afterJune8Created,
        neonAfterJune8Paid: afterJune8Paid,
        lastNeonByUpdated: lastByUpdated,
        lastNeonByCreated: lastByCreated,
        lastNeonByPaid: lastByPaid,
        recentNeonJunePlus: recentNeon,
      },
      null,
      2
    )
  );

  console.log("\n=== 2. WATERMARK ===");
  console.log(
    JSON.stringify(
      {
        syncStateRow: syncState,
        loadSyncWatermark: { watermark: watermark.toISOString(), source },
        queryFrom: queryFrom.toISOString(),
        overlapMinutes: 5,
      },
      null,
      2
    )
  );

  console.log("\n=== TN recent (page 1, no filter) ===");
  const recentTn = await tnFetch("/orders?page=1&per_page=20", {
    logContext: "recent_page1",
  });
  const recentTnOrders = Array.isArray(recentTn.json)
    ? (recentTn.json as Record<string, unknown>[])
    : [];
  const tnRecentSummary = recentTnOrders.map((o) => ({
    id: o.id,
    created_at: o.created_at,
    updated_at: o.updated_at,
    paid_at: o.paid_at,
    status: o.status,
    payment_status: o.payment_status,
    inNeon: false as boolean,
  }));

  const neonIds = new Set(
    (
      await prisma.tnOrder.findMany({
        where: { id: { in: tnRecentSummary.map((x) => String(x.id)) } },
        select: { id: true },
      })
    ).map((r) => r.id)
  );
  for (const row of tnRecentSummary) {
    row.inNeon = neonIds.has(String(row.id));
  }
  console.log(JSON.stringify(tnRecentSummary, null, 2));

  console.log("\n=== TN fetch with current watermark ===");
  let watermarkFetch: Record<string, unknown>[] = [];
  try {
    watermarkFetch = await fetchTnOrdersUpdatedSince({
      updatedAtMin: queryFrom,
      windowLabel: `rca:${queryFrom.toISOString()}`,
      maxPages: 5,
    });
  } catch (e) {
    console.log("watermark fetch error:", e instanceof Error ? e.message : e);
  }
  console.log(
    JSON.stringify(
      {
        fetchedWithWatermark: watermarkFetch.length,
        sample: watermarkFetch.slice(0, 10).map((o) => ({
          id: o.id,
          created_at: o.created_at,
          updated_at: o.updated_at,
          paid_at: o.paid_at,
          status: o.status,
          payment_status: o.payment_status,
        })),
      },
      null,
      2
    )
  );

  const missingFromNeon = tnRecentSummary.filter((o) => !o.inNeon);
  if (missingFromNeon.length) {
    console.log("\n=== Missing from Neon (recent TN page 1) ===");
    for (const o of missingFromNeon) {
      const updated = o.updated_at ? new Date(String(o.updated_at)) : null;
      const beforeWatermark =
        updated != null && updated.getTime() < queryFrom.getTime();
      console.log(
        JSON.stringify({
          ...o,
          updatedMs: updated?.toISOString(),
          queryFrom: queryFrom.toISOString(),
          updatedBeforeQueryFrom: beforeWatermark,
        })
      );
    }
  }

  console.log("\n=== TN fetch from 2026-06-01 (gap probe) ===");
  const gapFetch = await fetchTnOrdersUpdatedSince({
    updatedAtMin: new Date("2026-06-01T00:00:00.000Z"),
    windowLabel: "rca:gap-probe",
    maxPages: 20,
  });
  const gapMapped = gapFetch
    .map((r) => mapTnOrderRecord(r))
    .filter((r): r is NonNullable<ReturnType<typeof mapTnOrderRecord>> =>
      Boolean(r)
    );
  const gapIds = gapMapped.map((r) => r.id);
  const gapInNeon = await prisma.tnOrder.findMany({
    where: { id: { in: gapIds } },
    select: { id: true },
  });
  const gapInNeonSet = new Set(gapInNeon.map((r) => r.id));
  const gapMissing = gapMapped.filter((r) => !gapInNeonSet.has(r.id));
  console.log(
    JSON.stringify(
      {
        fetchedFromJune1: gapFetch.length,
        mapped: gapMapped.length,
        inNeon: gapInNeon.length,
        missingCount: gapMissing.length,
        missingSample: gapMissing.slice(0, 20).map((r) => ({
          id: r.id,
          tnCreatedAt: r.tnCreatedAt?.toISOString(),
          tnUpdatedAt: r.tnUpdatedAt?.toISOString(),
          tnPaidAt: r.tnPaidAt?.toISOString(),
          commercialStatus: r.commercialStatus,
        })),
      },
      null,
      2
    )
  );

  console.log("\n=== 4. PIPELINE RUNS (50) ===");
  const runsSummary = runs.map((r) => {
    const rep =
      r.reportJson && typeof r.reportJson === "object"
        ? (r.reportJson as Record<string, unknown>)
        : null;
    const imp = rep?.import as Record<string, unknown> | undefined;
    return {
      startedAt: r.startedAt,
      status: r.status,
      ordersImported: r.ordersImported,
      created: imp?.ordersCreated ?? null,
      updated: imp?.ordersUpdated ?? null,
      fetched: imp?.fetched ?? null,
      watermarkBefore: imp?.watermarkBefore ?? null,
      watermarkAfter: imp?.watermarkAfter ?? null,
      warnings: r.warningsCount,
      errors: r.errorsCount,
    };
  });
  console.log(JSON.stringify(runsSummary, null, 2));

  const chronological = [...runsSummary].reverse();
  const firstZeroFetched = chronological.find(
    (r) => (r.fetched as number | null) === 0 && (r.created as number | null) === 0
  );
  console.log("\n=== First sustained 0-import era ===");
  console.log(JSON.stringify(firstZeroFetched ?? "see runs above", null, 2));

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
