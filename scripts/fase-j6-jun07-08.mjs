#!/usr/bin/env node
/**
 * FASE J.6 — Import Jun 07-08 + reconciliación final 01-08
 * Uso: node scripts/fase-j6-jun07-08.mjs dryrun|import|reconcile|all
 */

import fs from "fs";
import path from "path";

const PROD =
  process.env.PROD_URL ??
  "https://nextjs-boilerplate-topaz-iota-40.vercel.app";
const PANEL = { ventas: 90, facturacion: 11979247 };
const PANEL_EXCLUDED_TN = "1990419241";
const PHASE = (process.argv[2] || "dryrun").toLowerCase();
const JUN_FROM = "2026-06-01";
const JUN_TO = "2026-06-08";
const TZ = "America/Argentina/Buenos_Aires";
const ART_OFFSET = "-03:00";
const WIP = path.join(process.cwd(), "_wip");

const DAYS = [
  { label: "07-jun", fromISO: "2026-06-07T03:00:00.000Z", toISO: "2026-06-08T02:59:59.999Z" },
  { label: "08-jun", fromISO: "2026-06-08T03:00:00.000Z", toISO: "2026-06-09T02:59:59.999Z" },
];

function loadEnv() {
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}
loadEnv();

const token =
  process.env.TIENDANUBE_IMPORT_TOKEN ||
  process.env.IMPORT_TOKEN ||
  process.env.IMPORT_ORDERS_TOKEN;

function artDayBoundsMs(y, m, d) {
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = `${y}-${pad(m)}-${pad(d)}`;
  return {
    startMs: Date.parse(`${ymd}T00:00:00.000${ART_OFFSET}`),
    endMs: Date.parse(`${ymd}T23:59:59.999${ART_OFFSET}`),
  };
}

function artRangeBoundsMs(fromYmd, toYmd) {
  const [fy, fm, fd] = fromYmd.split("-").map(Number);
  const [ty, tm, td] = toYmd.split("-").map(Number);
  return {
    startMs: artDayBoundsMs(fy, fm, fd).startMs,
    endMs: artDayBoundsMs(ty, tm, td).endMs,
  };
}

function parseInstantMs(iso) {
  const ms = Date.parse(String(iso ?? ""));
  return Number.isFinite(ms) ? ms : null;
}

function parseAmount(v) {
  if (v == null || v === "") return 0;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  let s = String(v).trim().replace(/^\$/, "");
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",") && !s.includes(".")) s = s.replace(",", ".");
  const n = parseFloat(s.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function sum(arr, fn) {
  return arr.reduce((a, x) => a + fn(x), 0);
}

async function importDay(day, dryRun) {
  const res = await fetch(`${PROD}/api/tiendanube/orders-paid/import-orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-import-token": token,
    },
    body: JSON.stringify({
      fromISO: day.fromISO,
      toISO: day.toISO,
      dryRun,
      importMp: false,
    }),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { ok: false, raw: text.slice(0, 400) };
  }
  const m = json.metrics ?? {};
  const previews = json.previews ?? (json.preview ? [json.preview] : []);
  const factPot = previews.reduce((a, p) => a + parseAmount(p?.totalFinal), 0);
  return {
    label: day.label,
    dryRun,
    http: res.status,
    ok: json.ok !== false,
    step: json.step,
    message: json.message,
    considered: m.consideredPaid ?? m.considered ?? 0,
    importable: m.wouldImport ?? m.importable ?? 0,
    imported: m.imported ?? 0,
    duplicated: m.duplicated ?? 0,
    errors: m.errors ?? (json.errors?.length ?? 0),
    errorList: json.errors ?? [],
    facturacionPotencial: factPot,
    metrics: m,
  };
}

async function fetchRemitos() {
  const res = await fetch(`${PROD}/api/erp/remitos`, { cache: "no-store" });
  const json = await res.json();
  return json.data ?? [];
}

async function fetchTnPaid0108() {
  const STORE = process.env.TIENDANUBE_STORE_ID;
  const T = process.env.TIENDANUBE_ACCESS_TOKEN;
  const orders = [];
  for (let page = 1; page <= 50; page++) {
    const q = new URLSearchParams({
      payment_status: "paid",
      created_at_min: "2026-06-01T00:00:00.000Z",
      created_at_max: "2026-06-08T23:59:59.999Z",
      page: String(page),
      per_page: "200",
    });
    const j = await fetch(`https://api.tiendanube.com/v1/${STORE}/orders?${q}`, {
      headers: { Authentication: `bearer ${T}`, "User-Agent": "8Q" },
    }).then((r) => r.json());
    if (!Array.isArray(j) || !j.length) break;
    orders.push(...j);
    if (j.length < 200) break;
    await new Promise((r) => setTimeout(r, 120));
  }
  return orders.map((o) => ({
    id: String(o.id),
    total: parseAmount(o.total),
    prendas: (o.products ?? []).reduce((a, p) => a + Number(p.quantity ?? 1), 0),
  }));
}

function erpJun0108(remitos) {
  const b = artRangeBoundsMs(JUN_FROM, JUN_TO);
  return remitos
    .filter((r) => {
      const ms = parseInstantMs(r.fechaRaw || r.fechaDisplay || "");
      return ms != null && ms >= b.startMs && ms <= b.endMs;
    })
    .map((r) => ({
      idRemito: String(r.idRemito ?? ""),
      tnOrderId: String(r.tnOrderId ?? "").trim(),
      totalFinal: parseAmount(r.totalFinal),
      prendas: parseAmount(r.totalPrendas),
    }));
}

function panelUniverse(tnPaid) {
  return tnPaid.filter((o) => o.id !== PANEL_EXCLUDED_TN);
}

async function runDryRun() {
  console.log("=== PASO 1 — DRY RUN ===");
  const results = [];
  for (const day of DAYS) {
    console.log(`\n${day.label} ...`);
    const r = await importDay(day, true);
    results.push(r);
    console.log(JSON.stringify(r, null, 2));
  }
  const out = path.join(WIP, "fase-j6-dryrun.json");
  fs.mkdirSync(WIP, { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ results }, null, 2));
  console.log("\nGuardado:", out);
  const bad = results.filter((r) => !r.ok || r.errors > 0);
  if (bad.length) process.exit(1);
  return results;
}

async function runImport() {
  console.log("=== PASO 2 — IMPORT REAL ===");
  const results = [];
  for (const day of DAYS) {
    console.log(`\n${day.label} import ...`);
    let r = await importDay(day, false);
    results.push(r);
    console.log(JSON.stringify(r, null, 2));

    if (!r.ok && r.http >= 500) {
      console.warn("HTTP 500 — auditando remitos parciales...");
      await new Promise((x) => setTimeout(x, 5000));
      const retry = await importDay(day, false);
      console.log("Retry:", JSON.stringify(retry, null, 2));
      results.push({ ...retry, label: day.label + "-retry" });
    }
    await new Promise((x) => setTimeout(x, 2000));
  }
  fs.writeFileSync(path.join(WIP, "fase-j6-import.json"), JSON.stringify({ results }, null, 2));
  return results;
}

async function runReconcile() {
  console.log("=== PASO 3-4 — VALIDACIÓN + RECONCILIACIÓN ===");
  const remitos = await fetchRemitos();
  const erp = erpJun0108(remitos);
  const tnPaid = await fetchTnPaid0108();
  const panel = panelUniverse(tnPaid);

  const erpTn = new Set(erp.map((r) => r.tnOrderId).filter(Boolean));
  const tnIds = new Set(tnPaid.map((o) => o.id));
  const panelIds = new Set(panel.map((o) => o.id));

  const panelNotErp = panel.filter((o) => !erpTn.has(o.id));
  const erpNotPanel = erp.filter((r) => r.tnOrderId && !panelIds.has(r.tnOrderId));
  const apiNotErp = tnPaid.filter((o) => !erpTn.has(o.id));
  const erpNotApi = erp.filter((r) => r.tnOrderId && !tnIds.has(r.tnOrderId));

  const uniqueTnErp = new Set(erp.map((r) => r.tnOrderId).filter(Boolean));

  const report = {
    generatedAt: new Date().toISOString(),
    erp: {
      remitos: erp.length,
      tnUnicos: uniqueTnErp.size,
      facturacion: Math.round(sum(erp, (r) => r.totalFinal)),
      prendas: Math.round(sum(erp, (r) => r.prendas)),
    },
    tnApiPaid0108: {
      ordenes: tnPaid.length,
      facturacion: Math.round(sum(tnPaid, (o) => o.total)),
      prendas: sum(tnPaid, (o) => o.prendas),
    },
    tnPanel0108: {
      ventas: PANEL.ventas,
      facturacion: PANEL.facturacion,
      formula: `91 paid − TN ${PANEL_EXCLUDED_TN}`,
      computed: {
        ventas: panel.length,
        facturacion: Math.round(sum(panel, (o) => o.total)),
      },
    },
    deltas: {
      panel_vs_erp_ordenes: PANEL.ventas - erp.length,
      panel_vs_erp_facturacion: PANEL.facturacion - Math.round(sum(erp, (r) => r.totalFinal)),
      api_vs_erp_ordenes: tnPaid.length - uniqueTnErp.size,
      api_vs_erp_facturacion: Math.round(sum(tnPaid, (o) => o.total)) - Math.round(sum(erp, (r) => r.totalFinal)),
    },
    panelNotErp: {
      count: panelNotErp.length,
      facturacion: Math.round(sum(panelNotErp, (o) => o.total)),
      orders: panelNotErp.map((o) => ({ id: o.id, total: o.total })),
    },
    erpNotPanel: {
      count: erpNotPanel.length,
      facturacion: Math.round(sum(erpNotPanel, (r) => r.totalFinal)),
      remitos: erpNotPanel.map((r) => ({
        idRemito: r.idRemito,
        tn: r.tnOrderId,
        total: r.totalFinal,
      })),
    },
    apiNotErp: {
      count: apiNotErp.length,
      facturacion: Math.round(sum(apiNotErp, (o) => o.total)),
      orders: apiNotErp.map((o) => ({ id: o.id, total: o.total })),
    },
    erpNotApi: {
      count: erpNotApi.length,
      facturacion: Math.round(sum(erpNotApi, (r) => r.totalFinal)),
      remitos: erpNotApi.map((r) => ({
        idRemito: r.idRemito,
        tn: r.tnOrderId,
        total: r.totalFinal,
      })),
    },
    liveImportReady:
      panelNotErp.length === 0 &&
      apiNotErp.length <= 1 &&
      erpNotPanel.every((r) =>
        ["1979195700", "1983697166", "1983819814"].includes(r.tnOrderId)
      ),
  };

  const out = path.join(WIP, "fase-j6-reconcile-final.json");
  fs.writeFileSync(out, JSON.stringify(report, null, 2));

  console.log("\n=== TABLA FINAL ===");
  console.table({
    ERP: `${report.erp.remitos} remitos / $${report.erp.facturacion.toLocaleString("es-AR")}`,
    TN_API: `${report.tnApiPaid0108.ordenes} órdenes / $${report.tnApiPaid0108.facturacion.toLocaleString("es-AR")}`,
    TN_PANEL: `${PANEL.ventas} ventas / $${PANEL.facturacion.toLocaleString("es-AR")}`,
  });

  console.log("\nΔ órdenes / facturación:");
  console.table(report.deltas);
  console.log("\nPanel ∩ ¬ERP:", report.panelNotErp.count, report.panelNotErp.facturacion);
  console.log("ERP ∩ ¬Panel:", report.erpNotPanel.count, report.erpNotPanel.facturacion);
  console.log("API ∩ ¬ERP:", report.apiNotErp.count, report.apiNotErp.facturacion);
  console.log("\nJSON:", out);
  return report;
}

async function main() {
  if (!token) throw new Error("IMPORT_TOKEN missing");
  console.log("PROD:", PROD, "PHASE:", PHASE);

  if (PHASE === "dryrun") await runDryRun();
  else if (PHASE === "import") await runImport();
  else if (PHASE === "reconcile") await runReconcile();
  else if (PHASE === "all") {
    await runDryRun();
    await runImport();
    await runReconcile();
  } else {
    console.error("Usar: dryrun | import | reconcile | all");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
