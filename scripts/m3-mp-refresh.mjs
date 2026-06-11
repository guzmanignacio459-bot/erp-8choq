#!/usr/bin/env node
/**
 * M3.1b-3 — Refresh controlado l1_gas_backfill → mp_api_sync_staging
 *
 * Uso:
 *   node scripts/m3-mp-refresh.mjs snapshot
 *   node scripts/m3-mp-refresh.mjs batch --size 25 --label phase-25
 *   node scripts/m3-mp-refresh.mjs coverage
 *   node scripts/m3-mp-refresh.mjs run-approved-plan
 */

import fs from "fs";
import path from "path";

import { loadEnvLocal } from "./lib/l0-env.mjs";
import { createPrisma, disconnectPrisma } from "./lib/l1-prisma.mjs";
import { collectM3MpCoverage } from "./lib/m3-mp-denorm.mjs";
import {
  paymentSnapshotRow,
  syncBatch,
} from "./lib/m3-mp-refresh-core.mjs";
import { validateBatchDeltas } from "./lib/m3-mp-refresh-validate.mjs";

loadEnvLocal();

const WIP = path.join(process.cwd(), "_wip");
const GLOBAL_SNAPSHOT = path.join(WIP, "m3-refresh-pre-global.json");
const STATE_FILE = path.join(WIP, "m3-refresh-state.json");

const APPROVED_PLAN = [
  { size: 25, label: "phase-25" },
  { size: 50, label: "phase-50" },
  { size: 100, label: "phase-100" },
  { size: 200, label: "phase-200a" },
  { size: 200, label: "phase-200b" },
  { size: 110, label: "phase-110" },
];

function requireEnv() {
  if (process.env.ERP_V2_DB_WRITE !== "true") {
    throw new Error("ERP_V2_DB_WRITE=true required");
  }
  if (!(process.env.DATABASE_URL ?? "").includes("neon.tech")) {
    throw new Error("DATABASE_URL must be Neon staging");
  }
  if (!(process.env.MP_ACCESS_TOKEN ?? "").trim()) {
    throw new Error("MP_ACCESS_TOKEN missing");
  }
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--size") args.size = Number(argv[++i]);
    else if (a === "--label") args.label = argv[++i];
    else args._.push(a);
  }
  return args;
}

function loadState() {
  if (!fs.existsSync(STATE_FILE)) {
    return { completedTnOrderIds: [], phases: [] };
  }
  return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
}

function saveState(state) {
  fs.mkdirSync(WIP, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function fetchPendingPayments(prisma) {
  const rows = await prisma.payment.findMany({
    where: { source: "l1_gas_backfill" },
    select: {
      id: true,
      tnOrderId: true,
      mpPaymentId: true,
      source: true,
      mpNetoRealOrden: true,
      mpFeeTotalReal: true,
      mpTaxTotalReal: true,
      mpFinancingTotalReal: true,
      mpTransactionAmount: true,
      mpTotalCostReal: true,
      mpDateApproved: true,
    },
    orderBy: { tnOrderId: "asc" },
  });
  return rows.filter((r) => r.tnOrderId);
}

async function snapshotGlobal(prisma) {
  const rows = await fetchPendingPayments(prisma);
  const payload = {
    phase: "M3.1b-3",
    action: "snapshot-global",
    generatedAt: new Date().toISOString(),
    count: rows.length,
    rows: rows.map(paymentSnapshotRow),
  };
  fs.mkdirSync(WIP, { recursive: true });
  fs.writeFileSync(GLOBAL_SNAPSHOT, JSON.stringify(payload, null, 2));
  console.log("[M3 refresh] global snapshot:", GLOBAL_SNAPSHOT, "rows:", rows.length);
  return payload;
}

async function coverageReport(prisma) {
  const [bySource, coverage] = await Promise.all([
    prisma.payment.groupBy({ by: ["source"], _count: { _all: true } }),
    collectM3MpCoverage(prisma),
  ]);
  const synced = await prisma.payment.count({
    where: { source: "mp_api_sync_staging" },
  });
  const pending = await prisma.payment.count({
    where: { source: "l1_gas_backfill" },
  });
  return {
    generatedAt: new Date().toISOString(),
    bySource,
    mpApiSyncStaging: synced,
    l1GasBackfillPending: pending,
    coverage,
  };
}

async function runBatch(prisma, { size, label }) {
  requireEnv();
  const state = loadState();
  const pending = await fetchPendingPayments(prisma);
  const batch = pending.slice(0, size);

  if (!batch.length) {
    console.log("[M3 refresh] no pending rows for batch", label);
    return { pass: true, synced: 0, pending: 0 };
  }

  const tnOrderIds = batch.map((r) => r.tnOrderId);
  const preRows = batch.map(paymentSnapshotRow);
  const prePath = path.join(WIP, `m3-refresh-pre-${label}.json`);
  fs.writeFileSync(
    prePath,
    JSON.stringify(
      { generatedAt: new Date().toISOString(), label, count: preRows.length, rows: preRows },
      null,
      2
    )
  );

  console.log(`[M3 refresh] batch ${label}: syncing ${tnOrderIds.length}...`);
  const syncResults = await syncBatch(prisma, tnOrderIds, { force: false });

  const postDb = await prisma.payment.findMany({
    where: { tnOrderId: { in: tnOrderIds } },
    select: {
      tnOrderId: true,
      mpPaymentId: true,
      source: true,
      mpNetoRealOrden: true,
      mpFeeTotalReal: true,
      mpTaxTotalReal: true,
      mpFinancingTotalReal: true,
      mpTransactionAmount: true,
      mpTotalCostReal: true,
      mpDateApproved: true,
    },
  });
  const postRows = postDb.map(paymentSnapshotRow);
  const postPath = path.join(WIP, `m3-refresh-post-${label}.json`);
  fs.writeFileSync(
    postPath,
    JSON.stringify(
      { generatedAt: new Date().toISOString(), label, count: postRows.length, rows: postRows },
      null,
      2
    )
  );

  const validation = validateBatchDeltas(preRows, postRows, syncResults);
  const cov = await coverageReport(prisma);

  const report = {
    generatedAt: new Date().toISOString(),
    label,
    batchSize: tnOrderIds.length,
    prePath,
    postPath,
    validation,
    coverage: {
      mpApiSyncStaging: cov.mpApiSyncStaging,
      l1GasBackfillPending: cov.l1GasBackfillPending,
    },
    syncResults,
  };

  const reportPath = path.join(WIP, `m3-refresh-report-${label}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  if (validation.pass) {
    state.phases.push({
      label,
      at: new Date().toISOString(),
      synced: validation.synced,
      pass: true,
      netoWarn: validation.netoWarn,
      netoOutliers: validation.netoFail,
    });
    saveState(state);
  }

  console.log(`[M3 refresh] report ${label}:`, reportPath);
  console.log(
    `[M3 refresh] ${label} PASS=${validation.pass} synced=${validation.synced} failed=${validation.syncFailed} feeFail=${validation.feeFail} netoWarn=${validation.netoWarn} coverage=${cov.mpApiSyncStaging}/${cov.mpApiSyncStaging + cov.l1GasBackfillPending}`
  );

  return { ...validation, reportPath, coverage: cov, label };
}

async function runApprovedPlan(prisma, { fromPhase } = {}) {
  const results = [];
  let start = 0;
  if (fromPhase) {
    start = APPROVED_PLAN.findIndex((p) => p.label === fromPhase);
    if (start < 0) throw new Error(`unknown fromPhase: ${fromPhase}`);
  }
  for (let i = start; i < APPROVED_PLAN.length; i++) {
    const phase = APPROVED_PLAN[i];
    const pending = await fetchPendingPayments(prisma);
    if (!pending.length) {
      console.log("[M3 refresh] no pending rows — done");
      break;
    }
    const result = await runBatch(prisma, phase);
    results.push({ ...phase, ...result });
    if (!result.pass) {
      console.error(`[M3 refresh] STOP — ${phase.label} failed validation`);
      break;
    }
    if (phase.label === "phase-25") {
      console.log("[M3 refresh] === BATCH 25 VALIDATION REPORT ===");
      console.log(JSON.stringify(result, null, 2));
    }
    if (phase.size >= 50) {
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  const summaryPath = path.join(WIP, "m3-refresh-plan-summary.json");
  fs.writeFileSync(summaryPath, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
  return results;
}

async function main() {
  const args = parseArgs(process.argv);
  const cmd = args._[0];
  requireEnv();

  const db = createPrisma();
  const prisma = db.prisma;

  try {
    if (cmd === "snapshot") {
      await snapshotGlobal(prisma);
      return;
    }
    if (cmd === "coverage") {
      const cov = await coverageReport(prisma);
      console.log(JSON.stringify(cov, null, 2));
      return;
    }
    if (cmd === "batch") {
      if (!args.size || !args.label) {
        throw new Error("batch requires --size N --label name");
      }
      const result = await runBatch(prisma, { size: args.size, label: args.label });
      console.log(JSON.stringify(result, null, 2));
      process.exitCode = result.pass ? 0 : 1;
      return;
    }
    if (cmd === "resume-plan") {
      const fromPhase = args._[1] ?? "phase-50";
      const results = await runApprovedPlan(prisma, { fromPhase });
      const allPass = results.every((r) => r.pass !== false);
      process.exitCode = allPass ? 0 : 1;
      return;
    }
    if (cmd === "run-approved-plan") {
      await snapshotGlobal(prisma);
      const results = await runApprovedPlan(prisma);
      const allPass = results.every((r) => r.pass !== false);
      process.exitCode = allPass ? 0 : 1;
      return;
    }
    throw new Error(`Unknown command: ${cmd}`);
  } finally {
    await disconnectPrisma(db);
  }
}

main().catch((e) => {
  console.error("[M3 refresh] fatal:", e.message ?? e);
  process.exit(1);
});
