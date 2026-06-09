#!/usr/bin/env node
/**
 * Sprint L0 — Reconcile backfill JSON vs métricas saneadas Abr/May/Jun.
 *
 * Uso:
 *   node scripts/l0-reconcile-json.mjs
 *   node scripts/l0-reconcile-json.mjs --input _wip/l0-backfill-2026-06-09.json
 *
 * Baselines (ART, post-auditorías Fase G/D/J.7):
 *   Abril: 360 órdenes, $49.592.312,37
 *   Mayo:  475 órdenes, $58.037.337,76 (dedup consolidado)
 *   Junio 01–08: 94 órdenes, $12.489.601 (post J.7, sin duplicados TN)
 */

import fs from "fs";
import path from "path";

import { inArtRange } from "./lib/l0-art-date.mjs";
import { parseAmount } from "./lib/l0-parse.mjs";

/** Tolerancia ARS para redondeos sheet */
const MONEY_EPS = 1.0;

export const L0_BASELINES = {
  abril: {
    label: "Abril 2026 saneado",
    from: "2026-04-01",
    to: "2026-04-30",
    orders: 360,
    facturacion: 49_592_312.37,
    source: "_wip/fase-g-abril-audit.json",
  },
  mayo: {
    label: "Mayo 2026 saneado (dedup consolidado)",
    from: "2026-05-01",
    to: "2026-05-31",
    orders: 475,
    facturacion: 58_037_337.76,
    source: "_wip/fase-d-erp-mayo-audit.json",
  },
  junio: {
    label: "Junio 01–08 saneado (post J.7)",
    from: "2026-06-01",
    to: "2026-06-08",
    orders: 94,
    facturacion: 12_489_601,
    source: "_wip/fase-j7-duplicados-junio.json",
  },
};

function parseArgs() {
  let input = process.env.L0_BACKFILL_IN;
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === "--input" && process.argv[i + 1]) {
      input = process.argv[++i];
    }
  }
  if (!input) {
    const wip = path.join(process.cwd(), "_wip");
    if (fs.existsSync(wip)) {
      const files = fs
        .readdirSync(wip)
        .filter((f) => f.startsWith("l0-backfill") && f.endsWith(".json"))
        .sort()
        .reverse();
      if (files[0]) input = path.join("_wip", files[0]);
    }
  }
  if (!input) {
    throw new Error("No input JSON — run l0-backfill-gas-to-json.mjs first");
  }
  return { input };
}

function filterOrdersInRange(orders, from, to) {
  return orders.filter((o) => inArtRange(o.fecha, from, to));
}

function metricsForOrders(orders) {
  return {
    orders: orders.length,
    facturacion: orders.reduce((sum, o) => sum + parseAmount(o.totalFinal), 0),
    totalPrendas: orders.reduce(
      (sum, o) => sum + (Number(o.totalPrendas) || 0),
      0
    ),
  };
}

function comparePeriod(key, baseline, actual) {
  const ordersDelta = actual.orders - baseline.orders;
  const factDelta = actual.facturacion - baseline.facturacion;
  const ordersOk = ordersDelta === 0;
  const factOk = Math.abs(factDelta) <= MONEY_EPS;
  return {
    key,
    label: baseline.label,
    range: { from: baseline.from, to: baseline.to },
    baseline: {
      orders: baseline.orders,
      facturacion: baseline.facturacion,
      source: baseline.source,
    },
    actual,
    delta: {
      orders: ordersDelta,
      facturacion: Math.round(factDelta * 100) / 100,
    },
    pass: ordersOk && factOk,
    checks: {
      orders: ordersOk ? "PASS" : "FAIL",
      facturacion: factOk ? "PASS" : "FAIL",
    },
  };
}

async function fetchErpAnalytics(from, to) {
  const base =
    process.env.PROD_URL ??
    "https://nextjs-boilerplate-topaz-iota-40.vercel.app";
  const res = await fetch(
    `${base}/api/erp/analytics?from=${from}&to=${to}`,
    { cache: "no-store" }
  );
  const json = await res.json();
  if (!json.ok) throw new Error(json.error ?? "analytics fail");
  const t = json.data?.totals ?? {};
  return {
    orders: Number(t.ordenesTotales ?? 0),
    facturacion: Number(t.facturacionTotal ?? 0),
  };
}

async function main() {
  const { input } = parseArgs();
  const abs = path.isAbsolute(input) ? input : path.join(process.cwd(), input);
  if (!fs.existsSync(abs)) {
    throw new Error(`Input not found: ${abs}`);
  }

  const data = JSON.parse(fs.readFileSync(abs, "utf8"));
  const orders = data.erpOrders ?? data.orders ?? [];
  if (!orders.length) throw new Error("JSON has no erpOrders/orders");

  const periods = [];
  const erpParity = [];

  for (const [key, baseline] of Object.entries(L0_BASELINES)) {
    const scoped = filterOrdersInRange(orders, baseline.from, baseline.to);
    const actual = metricsForOrders(scoped);
    periods.push(comparePeriod(key, baseline, actual));

    try {
      const erp = await fetchErpAnalytics(baseline.from, baseline.to);
      const ordersMatch = erp.orders === actual.orders;
      const factMatch = Math.abs(erp.facturacion - actual.facturacion) <= MONEY_EPS;
      erpParity.push({
        key,
        json: actual,
        erpAnalytics: erp,
        pass: ordersMatch && factMatch,
      });
    } catch (err) {
      erpParity.push({ key, error: String(err.message ?? err) });
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    phase: "L0",
    readOnly: true,
    input: input,
    inputCounts: data.counts ?? null,
    moneyEpsilon: MONEY_EPS,
    allPass: periods.every((p) => p.pass),
    erpParityPass: erpParity.every((p) => p.pass === true),
    erpParity,
    periods,
    totals: {
      allOrders: orders.length,
      allFacturacion: metricsForOrders(orders).facturacion,
    },
  };

  const out = path.join(
    "_wip",
    `l0-reconcile-${new Date().toISOString().slice(0, 10)}.json`
  );
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2));

  console.log(`[L0 reconcile] Input: ${input} (${orders.length} orders)`);
  for (const p of periods) {
    const icon = p.pass ? "✓" : "✗";
    console.log(
      `${icon} ${p.label}: orders ${p.actual.orders}/${p.baseline.orders} (${p.checks.orders}), ` +
        `fact $${p.actual.facturacion.toFixed(2)} vs $${p.baseline.facturacion.toFixed(2)} (${p.checks.facturacion})`
    );
  }
  console.log(`[L0 reconcile] baseline allPass=${report.allPass}`);
  if (report.erpParityPass) {
    console.log("[L0 reconcile] erpParity=PASS (JSON ≡ prod /api/erp/analytics)");
  } else {
    for (const p of erpParity) {
      if (p.pass === false) {
        console.log(`[L0 reconcile] erpParity FAIL ${p.key}`);
      }
    }
  }
  console.log(`[L0 reconcile] Wrote ${out}`);

  process.exit(report.erpParityPass ? 0 : 1);
}

main().catch((err) => {
  console.error("[L0 reconcile] FAIL:", err.message);
  process.exit(1);
});
