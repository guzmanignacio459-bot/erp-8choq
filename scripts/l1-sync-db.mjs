#!/usr/bin/env node
/**
 * Sprint L1 — Sync TN API + ERP GAS → DB staging (modo seguro)
 *
 * Uso:
 *   node scripts/l1-sync-db.mjs              # dry-run (default)
 *   node scripts/l1-sync-db.mjs --write      # upsert DB staging
 *   node scripts/l1-sync-db.mjs --write --reconcile-only
 *
 * Requiere .env.local:
 *   TIENDANUBE_* , APPS_SCRIPT_URL , (write) DATABASE_URL + L1_ALLOW_WRITE=true
 */

import fs from "fs";
import path from "path";

import { fetchListRemitosFull, fetchRemitoItemsFull } from "./lib/l0-gas-client.mjs";
import { inArtRange } from "./lib/l0-art-date.mjs";
import {
  assertSafeStagingUrl,
  applyReconciliationToDb,
  createPrisma,
  disconnectPrisma,
  upsertErpLayer,
  upsertTnLayer,
} from "./lib/l1-db.mjs";
import {
  buildCustomerRecords,
  erpInPeriodKpi,
  mapGasItemToErpOrderItem,
  mapGasRowToErpOrder,
} from "./lib/l1-erp-map.mjs";
import { L1_GLOBAL_FROM, L1_GLOBAL_TO, L1_PERIODS } from "./lib/l1-periods.mjs";
import { buildPeriodReport, reconcileLayers } from "./lib/l1-reconcile.mjs";
import {
  fetchTnOrdersL1Scope,
  mapTnOrderRecord,
} from "./lib/l1-tn-client.mjs";

function parseArgs() {
  let write = false;
  let reconcileOnly = false;
  let out = path.join("_wip", `l1-sync-report-${new Date().toISOString().slice(0, 10)}.json`);

  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === "--write") write = true;
    else if (a === "--reconcile-only") reconcileOnly = true;
    else if (a === "--out" && process.argv[i + 1]) out = process.argv[++i];
  }
  return { write, reconcileOnly, out };
}

function inL1Scope(iso) {
  return inArtRange(iso, L1_GLOBAL_FROM, L1_GLOBAL_TO);
}

async function fetchErpScoped() {
  console.log("[L1] Fetching GAS listRemitosFull…");
  const { rows } = await fetchListRemitosFull();
  const erpOrders = [];
  const payments = [];

  for (const row of rows) {
    const mapped = mapGasRowToErpOrder(row);
    if (!mapped) continue;
    if (!inL1Scope(mapped.order.fechaErp ?? mapped.order.fecha)) continue;
    erpOrders.push(mapped.order);
    if (mapped.payment) payments.push(mapped.payment);
  }

  console.log("[L1] Fetching GAS getRemitoItemsFull…");
  const { items: rawItems } = await fetchRemitoItemsFull();
  const erpOrderIds = new Set(erpOrders.map((o) => o.id));
  const erpOrderItems = rawItems
    .map(mapGasItemToErpOrderItem)
    .filter((it) => it && erpOrderIds.has(it.erpOrderId));

  const customers = buildCustomerRecords(erpOrders);

  return { erpOrders, erpOrderItems, payments, customers };
}

async function fetchTnScoped() {
  console.log("[L1] Fetching TN API (paid, created Apr–Jun)…");
  const raw = await fetchTnOrdersL1Scope();
  const tnRecords = raw.map(mapTnOrderRecord).filter(Boolean);
  console.log(`[L1] TN raw=${raw.length} mapped=${tnRecords.length}`);
  return tnRecords;
}

async function main() {
  const { write, reconcileOnly, out } = parseArgs();
  const started = Date.now();
  const mode = write ? "write" : "dry-run";

  console.log(`[L1] mode=${mode} periods=Abr/May/Jun01-08`);

  const tnRecords = await fetchTnScoped();
  let erpBundle = { erpOrders: [], erpOrderItems: [], payments: [], customers: [] };

  if (!reconcileOnly) {
    erpBundle = await fetchErpScoped();
  } else if (write) {
    throw new Error("--reconcile-only requires existing DB data from prior --write");
  }

  const { erpOrders, erpOrderItems, payments, customers } = erpBundle;

  const globalReconcile = reconcileLayers({ tnRecords, erpOrders });
  const periodReports = buildPeriodReport(tnRecords, erpOrders);

  const stats = {
    tnOrders: { upserted: 0 },
    tnOrderItems: { created: 0 },
    customers: { upserted: 0 },
    erpOrders: { upserted: 0 },
    erpOrderItems: { created: 0, updated: 0 },
    payments: { upserted: 0 },
    reconciliation: null,
  };

  if (write) {
    assertSafeStagingUrl(process.env.DATABASE_URL);
    const db = createPrisma();
    try {
      console.log("[L1] Upserting TN layer…");
      await upsertTnLayer(db.prisma, tnRecords, stats);
      if (!reconcileOnly) {
        console.log("[L1] Upserting ERP layer…");
        await upsertErpLayer(
          db.prisma,
          { customers, erpOrders, erpOrderItems, payments },
          stats
        );
      }
      console.log("[L1] Applying reconciliation status to erp_orders…");
      stats.reconciliation = await applyReconciliationToDb(
        db.prisma,
        tnRecords,
        erpOrders
      );
    } finally {
      await disconnectPrisma(db);
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    phase: "L1",
    mode,
    readOnly: !write,
    scope: { from: L1_GLOBAL_FROM, to: L1_GLOBAL_TO, periods: L1_PERIODS },
    elapsedMs: Date.now() - started,
    counts: {
      tnOrdersFetched: tnRecords.length,
      tnOrderItemsFetched: tnRecords.reduce(
        (s, t) => s + (t.items?.length ?? 0),
        0
      ),
      erpOrdersScoped: erpOrders.length,
      erpOrderItemsScoped: erpOrderItems.length,
      paymentsScoped: payments.length,
      customersScoped: customers.length,
    },
    db: write ? stats : { skipped: true, reason: "dry-run" },
    kpiSource: {
      commercial: "tn_orders (tn_total, paid_at ART, tn_analytics_counted)",
      operational:
        "erp_orders (total_final_erp, neto_operativo, erp_order_items)",
    },
    globalReconciliation: globalReconcile.byStatus,
    periods: periodReports,
    risksBeforeL2: [
      "Baselines 'saneado' históricos ≠ universo TN paid_at ART (ver deltas por mes)",
      "Remitos manuales (sin tn_order_id) no entran en KPI comercial TN",
      "MP en payments es read-only backfill — no se aplicó mp/apply",
      "L2 requiere /api/v2/analytics shadow antes de cortar GAS",
    ],
  };

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2));

  console.log("\n[L1] KPI por período:");
  for (const p of periodReports) {
    console.log(
      `  ${p.label}: TN ${p.kpi.tn.orders} / $${p.kpi.tn.facturacion.toLocaleString("es-AR")} | ` +
        `ERP ${p.kpi.erp.remitos} / $${p.kpi.erp.facturacion.toLocaleString("es-AR")} | ` +
        `recon ${JSON.stringify(p.reconciliation)}`
    );
  }
  console.log(`\n[L1] Report → ${out}`);
  console.log(`[L1] globalReconciliation ${JSON.stringify(globalReconcile.byStatus)}`);

  if (write) {
    console.log(`[L1] DB stats ${JSON.stringify(stats)}`);
  }
}

function logL1Error(err) {
  console.error("[L1] FAIL:", err.message);
  const c = err.cause;
  if (c) {
    console.error(
      "[L1] cause:",
      [c.code, c.errno, c.syscall, c.hostname, c.message]
        .filter(Boolean)
        .join(" ")
    );
  }
  if (process.env.L1_DEBUG === "1" && err.stack) {
    console.error(err.stack);
  }
}

main().catch((err) => {
  logL1Error(err);
  process.exit(1);
});
