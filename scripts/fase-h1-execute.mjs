#!/usr/bin/env node
/**
 * FASE H.1 — Eliminar remito cancelado abril (único).
 *
 *   node scripts/fase-h1-execute.mjs              # dry-run + backup
 *   node scripts/fase-h1-execute.mjs --execute    # borra filas
 */

import fs from "fs";
import path from "path";
import { google } from "googleapis";

const SPREADSHEET_ID =
  process.env.GOOGLE_SPREADSHEET_ID || "1EDHbX270hNB_BoMfY2iBWJ-CRl5EJWrDKxudUJ1eGWo";
const SHEET_REMITOS = "REMITOS";
const SHEET_ITEMS = "REMITO_ITEMS";
const PROD =
  process.env.PROD_URL ??
  "https://nextjs-boilerplate-topaz-iota-40.vercel.app";

const TARGET_REMITO = "R-1780333090629";
const TARGET_TN = "1955271645";

const ABRIL_FROM = "2026-04-01";
const ABRIL_TO = "2026-04-30";
const ABRMAY_FROM = "2026-04-01";
const ABRMAY_TO = "2026-05-31";

const EXPECTED = {
  abril: { remitos: 359, facturacion: 49491775 },
  abrMay: { remitos: 823, facturacion: 107590573 },
};

const execute = process.argv.includes("--execute");
const WIP = path.join(process.cwd(), "_wip");

function loadEnvLocal() {
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const k = t.slice(0, i);
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}

function pickIdx(headers, names) {
  for (const n of names) {
    const t = String(n).trim().toLowerCase();
    const i = headers.findIndex((h) => String(h || "").trim().toLowerCase() === t);
    if (i >= 0) return i;
  }
  return -1;
}

function num(v) {
  if (v == null || v === "") return 0;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  let raw = String(v).trim().replace(/^\$/, "").trim();
  const clean = raw.replace(/[^\d.,\-]/g, "");
  if (!clean) return 0;
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(clean))
    return parseFloat(clean.replace(/,/g, "")) || 0;
  if (clean.includes(",") && clean.includes("."))
    return parseFloat(clean.replace(/\./g, "").replace(",", ".")) || 0;
  if (clean.includes(",") && !clean.includes("."))
    return parseFloat(clean.replace(",", ".")) || 0;
  const n = parseFloat(clean);
  return Number.isFinite(n) ? n : 0;
}

function rowToObj(headers, row) {
  const o = {};
  headers.forEach((h, i) => {
    if (!h) return;
    let v = row[i];
    if (v instanceof Date) v = v.toISOString();
    o[h] = v;
  });
  return o;
}

function inRange(ymd, from, to) {
  return ymd >= from && ymd <= to;
}

async function getSheetsClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = (process.env.GOOGLE_SERVICE_ACCOUNT_KEY || "").replace(/\\n/g, "\n");
  if (!email || !key) throw new Error("Faltan GOOGLE_SERVICE_ACCOUNT_* en .env.local");
  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

async function getSheetId(sheets, title) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const sh = meta.data.sheets?.find((s) => s.properties?.title === title);
  if (!sh || sh.properties?.sheetId == null)
    throw new Error(`Hoja no encontrada: ${title}`);
  return sh.properties.sheetId;
}

async function readSheet(sheets, title) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${title}'`,
  });
  const values = res.data.values ?? [];
  if (!values.length) return { headers: [], rows: [] };
  const headers = values[0].map((h) => String(h || "").trim());
  const rows = values.slice(1).map((row, i) => ({ sheetRow: i + 2, cells: row }));
  return { headers, rows };
}

async function deleteRows(sheets, sheetId, rowNumbers) {
  const sorted = [...rowNumbers].sort((a, b) => b - a);
  const requests = sorted.map((row1) => ({
    deleteDimension: {
      range: {
        sheetId,
        dimension: "ROWS",
        startIndex: row1 - 1,
        endIndex: row1,
      },
    },
  }));
  for (let i = 0; i < requests.length; i += 25) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests: requests.slice(i, i + 25) },
    });
  }
}

async function fetchAnalytics(from, to) {
  const res = await fetch(`${PROD}/api/erp/analytics?from=${from}&to=${to}`, {
    cache: "no-store",
  });
  const json = await res.json();
  return json?.data?.totals ?? null;
}

async function fetchRemitos() {
  const res = await fetch(`${PROD}/api/erp/remitos`, { cache: "no-store" });
  const json = await res.json();
  return json.data ?? [];
}

async function tnOrder(id) {
  const STORE = process.env.TIENDANUBE_STORE_ID;
  const TOKEN = process.env.TIENDANUBE_ACCESS_TOKEN;
  const BASE = process.env.TIENDANUBE_API_URL?.trim() || "https://api.tiendanube.com/v1";
  const res = await fetch(`${BASE}/${STORE}/orders/${id}`, {
    headers: {
      Authentication: `bearer ${TOKEN}`,
      "User-Agent": process.env.TIENDANUBE_USER_AGENT || "8Q ERP",
    },
  });
  return res.json();
}

function findDuplicates(remitos, from, to) {
  const byTn = new Map();
  for (const r of remitos) {
    const raw = r.fechaRaw || "";
    const d = raw.slice(0, 10);
    if (!inRange(d, from, to)) continue;
    const tn = String(r.tnOrderId ?? "").trim();
    if (!tn) continue;
    if (!byTn.has(tn)) byTn.set(tn, []);
    byTn.get(tn).push(r.idRemito);
  }
  return [...byTn.entries()].filter(([, v]) => v.length > 1);
}

async function validatePost(remitos) {
  const analyticsAbr = await fetchAnalytics(ABRIL_FROM, ABRIL_TO);
  const analyticsAbrMay = await fetchAnalytics(ABRMAY_FROM, ABRMAY_TO);

  const dups = findDuplicates(remitos, ABRMAY_FROM, ABRMAY_TO);

  const abrMayRemitos = remitos.filter((r) =>
    inRange((r.fechaRaw || "").slice(0, 10), ABRMAY_FROM, ABRMAY_TO)
  );

  const cancelled = [];
  for (const r of abrMayRemitos) {
    const tn = String(r.tnOrderId ?? "").trim();
    if (!tn) continue;
    try {
      const o = await tnOrder(tn);
      const st = String(o?.status ?? "").toLowerCase();
      const ps = String(o?.payment_status ?? "").toLowerCase();
      if (st === "cancelled" || st === "canceled" || ps === "refunded" || ps === "voided") {
        cancelled.push({ remito: r.idRemito, tn, status: o.status, payment_status: o.payment_status });
      }
      await new Promise((x) => setTimeout(x, 80));
    } catch {
      /* ignore */
    }
  }

  const abrilFact = Math.round(analyticsAbr?.facturacionTotal ?? 0);
  const abrMayFact = Math.round(analyticsAbrMay?.facturacionTotal ?? 0);

  const checks = {
    abrilRemitos: {
      actual: analyticsAbr?.ordenesTotales ?? 0,
      expected: EXPECTED.abril.remitos,
      ok: analyticsAbr?.ordenesTotales === EXPECTED.abril.remitos,
    },
    abrilFacturacion: {
      actual: abrilFact,
      expected: EXPECTED.abril.facturacion,
      ok: Math.abs(abrilFact - EXPECTED.abril.facturacion) < 2,
    },
    abrMayRemitos: {
      actual: analyticsAbrMay?.ordenesTotales ?? 0,
      expected: EXPECTED.abrMay.remitos,
      ok: analyticsAbrMay?.ordenesTotales === EXPECTED.abrMay.remitos,
    },
    abrMayFacturacion: {
      actual: abrMayFact,
      expected: EXPECTED.abrMay.facturacion,
      ok: Math.abs(abrMayFact - EXPECTED.abrMay.facturacion) < 2,
    },
    duplicados: { actual: dups.length, expected: 0, ok: dups.length === 0 },
    canceladas: { actual: cancelled.length, expected: 0, ok: cancelled.length === 0 },
    targetAbsent: {
      actual: remitos.some((r) => String(r.idRemito) === TARGET_REMITO),
      expected: false,
      ok: !remitos.some((r) => String(r.idRemito) === TARGET_REMITO),
    },
  };

  return { checks, dups, cancelled, analyticsAbr, analyticsAbrMay };
}

loadEnvLocal();

const sheets = await getSheetsClient();
const remitosSheetId = await getSheetId(sheets, SHEET_REMITOS);
const itemsSheetId = await getSheetId(sheets, SHEET_ITEMS);

const remitosData = await readSheet(sheets, SHEET_REMITOS);
const itemsData = await readSheet(sheets, SHEET_ITEMS);

const idxRemitoId = pickIdx(remitosData.headers, ["ID Remito"]);
const idxTn = pickIdx(remitosData.headers, ["TN_ORDER_ID", "TN Order ID", "TN Order Id"]);
const idxItemsRemitoId = pickIdx(itemsData.headers, ["ID Remito", "ID"]);
if (idxRemitoId < 0) throw new Error("REMITOS: columna ID Remito no encontrada");
if (idxItemsRemitoId < 0) throw new Error("REMITO_ITEMS: columna ID Remito no encontrada");

const remitosToDelete = remitosData.rows.filter(
  (r) => String(r.cells[idxRemitoId] ?? "").trim() === TARGET_REMITO
);

if (remitosToDelete.length !== 1) {
  throw new Error(
    `Se esperaba exactamente 1 remito ${TARGET_REMITO}, encontrados: ${remitosToDelete.length}`
  );
}

const tnCell = idxTn >= 0 ? String(remitosToDelete[0].cells[idxTn] ?? "").trim() : "";
if (tnCell && tnCell !== TARGET_TN) {
  throw new Error(`TN mismatch: esperado ${TARGET_TN}, encontrado ${tnCell}`);
}

const itemsToDelete = itemsData.rows.filter(
  (r) => String(r.cells[idxItemsRemitoId] ?? "").trim() === TARGET_REMITO
);

const backup = {
  generatedAt: new Date().toISOString(),
  fase: "H.1",
  spreadsheetId: SPREADSHEET_ID,
  target: { remito: TARGET_REMITO, tn: TARGET_TN },
  remitos: remitosToDelete.map((r) => ({
    sheetRow: r.sheetRow,
    ...rowToObj(remitosData.headers, r.cells),
  })),
  remitoItems: itemsToDelete.map((r) => ({
    sheetRow: r.sheetRow,
    ...rowToObj(itemsData.headers, r.cells),
  })),
};

const backupPath = path.join(WIP, `fase-h1-backup-${Date.now()}.json`);
fs.mkdirSync(WIP, { recursive: true });
fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));

const deleteRemitoRows = remitosToDelete.map((r) => r.sheetRow);
const deleteItemRows = itemsToDelete.map((r) => r.sheetRow);
const sumTotal = backup.remitos.reduce((s, r) => s + num(r["Total Final"]), 0);

const analyticsAbrBefore = await fetchAnalytics(ABRIL_FROM, ABRIL_TO);
const analyticsAbrMayBefore = await fetchAnalytics(ABRMAY_FROM, ABRMAY_TO);

const plan = {
  mode: execute ? "EXECUTE" : "DRY_RUN",
  backupPath,
  target: TARGET_REMITO,
  tn: TARGET_TN,
  counts: {
    remitosToDelete: deleteRemitoRows.length,
    itemsToDelete: deleteItemRows.length,
  },
  sumTotalFinalDeleted: Math.round(sumTotal * 100) / 100,
  remitoRows: deleteRemitoRows,
  itemRows: deleteItemRows.sort((a, b) => a - b),
  analyticsBefore: {
    abril: analyticsAbrBefore,
    abrMay: analyticsAbrMayBefore,
  },
};

console.log("=== FASE H.1 — Cancelada abril ===");
console.log("Modo:", plan.mode);
console.log("Backup:", backupPath);
console.table(plan.counts);
console.log("Total Final a eliminar:", plan.sumTotalFinalDeleted);
console.log("Analytics abril ANTES:", analyticsAbrBefore?.ordenesTotales, "/", Math.round(analyticsAbrBefore?.facturacionTotal ?? 0));
console.log("Analytics Abr+May ANTES:", analyticsAbrMayBefore?.ordenesTotales, "/", Math.round(analyticsAbrMayBefore?.facturacionTotal ?? 0));

if (!execute) {
  console.log("\n[DRY RUN] Sin borrado. Usar --execute para aplicar.");
  fs.writeFileSync(path.join(WIP, "fase-h1-plan.json"), JSON.stringify(plan, null, 2));
  process.exit(0);
}

console.log("\nEliminando REMITO_ITEMS...");
await deleteRows(sheets, itemsSheetId, deleteItemRows);
console.log("Eliminando REMITOS...");
await deleteRows(sheets, remitosSheetId, deleteRemitoRows);

// Breve espera para propagación API
await new Promise((x) => setTimeout(x, 2000));

const remitosAfter = await fetchRemitos();
const validation = await validatePost(remitosAfter);

const result = {
  executedAt: new Date().toISOString(),
  backupPath,
  deleted: plan.counts,
  sumTotalFinalDeleted: plan.sumTotalFinalDeleted,
  analyticsBefore: plan.analyticsBefore,
  analyticsAfter: {
    abril: validation.analyticsAbr,
    abrMay: validation.analyticsAbrMay,
  },
  validation: validation.checks,
  allOk: Object.values(validation.checks).every((c) => c.ok),
};

const resultPath = path.join(WIP, "fase-h1-result.json");
fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));

console.log("\n=== POST H.1 — Validación ===");
console.table(
  Object.fromEntries(
    Object.entries(validation.checks).map(([k, v]) => [
      k,
      `${v.actual} (esp. ${v.expected}) ${v.ok ? "✓" : "✗"}`,
    ])
  )
);

if (validation.dups.length) {
  console.log("Duplicados:", validation.dups);
}
if (validation.cancelled.length) {
  console.log("Canceladas/refunded:", validation.cancelled);
}

console.log("Resultado:", resultPath);

if (!result.allOk) {
  console.error("VALIDACIÓN FALLIDA — revisar", resultPath);
  process.exit(1);
}

console.log("\nFASE H.1 completada con éxito.");
