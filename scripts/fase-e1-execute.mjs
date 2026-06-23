#!/usr/bin/env node
/**
 * FASE E.1 — Eliminar 13 remitos duplicados/cancelados + REMITO_ITEMS (controlado).
 *
 *   node scripts/fase-e1-execute.mjs              # dry-run + backup
 *   node scripts/fase-e1-execute.mjs --execute    # borra filas
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
const MAYO_FROM = "2026-05-01";
const MAYO_TO = "2026-05-31";

const IDS_TO_DELETE = new Set([
  "R-1780417228621",
  "R-1780417252552",
  "R-1780417266046",
  "R-1780417288289",
  "R-1780417306283",
  "R-1780417320679",
  "R-1780417339157",
  "R-1780417356012",
  "R-1780417374361",
  "R-1780417614155",
  "R-1780417660352",
  "R-1780417679186",
  "R-1780421936861",
]);

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

async function fetchAnalytics() {
  const res = await fetch(
    `${PROD}/api/erp/analytics?from=${MAYO_FROM}&to=${MAYO_TO}`,
    { cache: "no-store" }
  );
  const json = await res.json();
  return json?.data?.totals ?? null;
}

loadEnvLocal();

const sheets = await getSheetsClient();
const remitosSheetId = await getSheetId(sheets, SHEET_REMITOS);
const itemsSheetId = await getSheetId(sheets, SHEET_ITEMS);

const remitosData = await readSheet(sheets, SHEET_REMITOS);
const itemsData = await readSheet(sheets, SHEET_ITEMS);

const idxRemitoId = pickIdx(remitosData.headers, ["ID Remito"]);
const idxItemsRemitoId = pickIdx(itemsData.headers, ["ID Remito", "ID"]);
if (idxRemitoId < 0) throw new Error("REMITOS: columna ID Remito no encontrada");
if (idxItemsRemitoId < 0) throw new Error("REMITO_ITEMS: columna ID Remito no encontrada");

const remitosToDelete = remitosData.rows.filter((r) => {
  const id = String(r.cells[idxRemitoId] ?? "").trim();
  return IDS_TO_DELETE.has(id);
});

const itemsToDelete = itemsData.rows.filter((r) => {
  const id = String(r.cells[idxItemsRemitoId] ?? "").trim();
  return IDS_TO_DELETE.has(id);
});

const foundIds = new Set(remitosToDelete.map((r) => String(r.cells[idxRemitoId]).trim()));
const missing = [...IDS_TO_DELETE].filter((id) => !foundIds.has(id));
if (missing.length) throw new Error(`IDs no encontrados en REMITOS: ${missing.join(", ")}`);

const extra = remitosToDelete.filter((r) => !IDS_TO_DELETE.has(String(r.cells[idxRemitoId]).trim()));
if (extra.length) throw new Error("Filas fuera de allowlist detectadas — abort");

const backup = {
  generatedAt: new Date().toISOString(),
  spreadsheetId: SPREADSHEET_ID,
  idsToDelete: [...IDS_TO_DELETE],
  remitos: remitosToDelete.map((r) => ({
    sheetRow: r.sheetRow,
    ...rowToObj(remitosData.headers, r.cells),
  })),
  remitoItems: itemsToDelete.map((r) => ({
    sheetRow: r.sheetRow,
    ...rowToObj(itemsData.headers, r.cells),
  })),
};

const backupPath = path.join(WIP, `fase-e1-backup-${Date.now()}.json`);
fs.mkdirSync(WIP, { recursive: true });
fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));

const deleteRemitoRows = remitosToDelete.map((r) => r.sheetRow);
const deleteItemRows = itemsToDelete.map((r) => r.sheetRow);

const sumTotal = backup.remitos.reduce((s, r) => s + num(r["Total Final"]), 0);

const analyticsBefore = await fetchAnalytics();

const plan = {
  mode: execute ? "EXECUTE" : "DRY_RUN",
  backupPath,
  counts: {
    remitosToDelete: deleteRemitoRows.length,
    itemsToDelete: deleteItemRows.length,
  },
  sumTotalFinalDeleted: Math.round(sumTotal * 100) / 100,
  remitoRows: deleteRemitoRows.sort((a, b) => a - b),
  itemRows: deleteItemRows.sort((a, b) => a - b),
  analyticsBefore,
  analyticsAfterProjected: analyticsBefore
    ? {
        ordenesTotales: analyticsBefore.ordenesTotales - deleteRemitoRows.length,
        facturacionTotal:
          analyticsBefore.facturacionTotal - sumTotal,
      }
    : null,
};

console.log("=== FASE E.1 ===");
console.log("Modo:", plan.mode);
console.log("Backup:", backupPath);
console.table(plan.counts);
console.log("SUM Total Final a eliminar:", plan.sumTotalFinalDeleted);
console.log("Analytics ANTES:", analyticsBefore);
console.log("Proyectado DESPUÉS:", plan.analyticsAfterProjected);

if (!execute) {
  console.log("\n[DRY RUN] Sin borrado. Usar --execute para aplicar.");
  fs.writeFileSync(path.join(WIP, "fase-e1-plan.json"), JSON.stringify(plan, null, 2));
  process.exit(0);
}

// Ejecutar: primero ITEMS, luego REMITOS (ambos bottom-up)
console.log("\nEliminando REMITO_ITEMS...");
await deleteRows(sheets, itemsSheetId, deleteItemRows);
console.log("Eliminando REMITOS...");
await deleteRows(sheets, remitosSheetId, deleteRemitoRows);

const analyticsAfter = await fetchAnalytics();

// Verificar duplicados mayo
const remitosRes = await fetch(`${PROD}/api/erp/remitos`, { cache: "no-store" });
const remitosJson = await remitosRes.json();
const mayoRemitos = (remitosJson.data ?? []).filter((r) => {
  const raw = r.fechaRaw || "";
  if (!raw) return false;
  const d = raw.slice(0, 10);
  return d >= MAYO_FROM && d <= MAYO_TO;
});
const byTn = new Map();
for (const r of mayoRemitos) {
  const tn = String(r.tnOrderId ?? "").trim();
  if (!tn) continue;
  if (!byTn.has(tn)) byTn.set(tn, []);
  byTn.get(tn).push(r.idRemito);
}
const dups = [...byTn.entries()].filter(([, v]) => v.length > 1);
const cancelPresent = mayoRemitos.some((r) => String(r.tnOrderId) === "1972290115");

const result = {
  executedAt: new Date().toISOString(),
  backupPath,
  deleted: plan.counts,
  sumTotalFinalDeleted: plan.sumTotalFinalDeleted,
  analyticsBefore,
  analyticsAfter,
  mayoRemitos: mayoRemitos.length,
  duplicadosRestantes: dups.length,
  cancelada1972290115Presente: cancelPresent,
  idsStillPresent: mayoRemitos
    .filter((r) => IDS_TO_DELETE.has(String(r.idRemito)))
    .map((r) => r.idRemito),
};

const resultPath = path.join(WIP, "fase-e1-result.json");
fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));

console.log("\n=== POST E.1 ===");
console.table({
  remitosMayo: result.mayoRemitos,
  facturacion: result.analyticsAfter?.facturacionTotal,
  duplicados: result.duplicadosRestantes,
  canceladaEnErp: result.cancelada1972290115Presente,
  idsResidual: result.idsStillPresent.length,
});
console.log("Resultado:", resultPath);

if (result.idsStillPresent.length || result.duplicadosRestantes > 0 || cancelPresent) {
  console.error("ADVERTENCIA: verificación post-ejecución incompleta");
  process.exit(1);
}
