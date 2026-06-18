/**
 * Fase B — Reparación histórica cabecera shipping + limpieza ítems (Abr/Mayo).
 * Solo: REMITOS (SCC, Envio Owner, SOC) + REMITO_ITEMS.SHIPPING_ASIGNADO.
 *
 *   node scripts/repair-shipping-header-historical.mjs           # dryRun
 *   node scripts/repair-shipping-header-historical.mjs --execute # real
 *   node scripts/repair-shipping-header-historical.mjs --execute --from-plan  # sin re-fetch TN
 */

import fs from "fs";
import path from "path";
import { google } from "googleapis";

const SPREADSHEET_ID =
  process.env.GOOGLE_SPREADSHEET_ID || "1EDHbX270hNB_BoMfY2iBWJ-CRl5EJWrDKxudUJ1eGWo";
const FROM = process.env.REPAIR_FROM || "2026-04-01";
const TO = process.env.REPAIR_TO || "2026-05-31";
const TZ = "America/Argentina/Buenos_Aires";
const EPS = 0.02;
const TOL = 1.5;
const TN_BASE = "https://api.tiendanube.com/v1";
const PLAN_PATH = process.env.REPAIR_PLAN_PATH || "/tmp/repair_shipping_header_plan.json";

const execute = process.argv.includes("--execute");
const fromPlan = process.argv.includes("--from-plan");
const dryRun = !execute;

/** Alcance esperado (auditoría previa) */
const EXPECTED = {
  remitos: 585,
  socToScc: 4_945_808.17,
  itemCells: 1555,
  abril: { remitos: 214, socToScc: 1_832_495.91 },
  mayo: { remitos: 371, socToScc: 3_113_312.26 },
};

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

function num(v) {
  if (v == null || v === "") return 0;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  let raw = String(v).trim().replace(/^\$/, "").trim();
  const clean = raw.replace(/[^\d.,\-]/g, "");
  if (!clean) return 0;
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(clean)) {
    return parseFloat(clean.replace(/,/g, "")) || 0;
  }
  if (clean.includes(",") && clean.includes(".")) {
    return parseFloat(clean.replace(/\./g, "").replace(",", ".")) || 0;
  }
  if (clean.includes(",") && !clean.includes(".")) {
    return parseFloat(clean.replace(",", ".")) || 0;
  }
  const n = parseFloat(clean);
  return Number.isFinite(n) ? n : 0;
}

function parseDate(v) {
  if (!v) return null;
  if (typeof v === "number") {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? null : d;
  }
  const s = String(v).trim();
  const slash = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (slash) {
    let y = Number(slash[3]);
    if (y < 100) y += 2000;
    return new Date(y, Number(slash[2]) - 1, Number(slash[1]));
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function dayKey(d) {
  return d ? d.toLocaleDateString("en-CA", { timeZone: TZ }) : "";
}

function inRange(d, from, to) {
  const k = dayKey(d);
  return k && (!from || k >= from) && (!to || k <= to);
}

function normOwner(v) {
  const s = String(v || "").trim().toUpperCase();
  if (s.includes("8Q") || s.includes("OCHOQ")) return "8Q";
  if (s.includes("CLIENTE") || s.includes("CUSTOMER")) return "CLIENTE";
  return s;
}

function pickIdx(headers, names) {
  for (const n of names) {
    const t = String(n).trim().toLowerCase();
    const i = headers.findIndex((h) => String(h || "").trim().toLowerCase() === t);
    if (i >= 0) return i;
  }
  return -1;
}

function colToA1(idx) {
  let n = idx;
  let s = "";
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

function firstMoney(...vals) {
  for (const v of vals) {
    const n = num(v);
    if (n > EPS) return n;
  }
  return 0;
}

function tnShippingTruth(order) {
  const scc = num(order?.shipping_cost_customer);
  const sco = num(order?.shipping_cost_owner);
  const sc = num(order?.shipping_cost);
  const st = num(order?.shipping_total);
  const line0 = Array.isArray(order?.shipping_lines) ? order.shipping_lines[0] : null;
  const linePrice = firstMoney(line0?.price, line0?.cost, line0?.amount);
  const optPrice = firstMoney(
    order?.shipping_option?.price,
    order?.shipping_option?.cost,
    order?.shipping_option?.amount
  );

  const signals = [];
  if (scc > EPS) signals.push({ field: "shipping_cost_customer", amount: scc });
  if (sc > EPS && scc <= EPS) signals.push({ field: "shipping_cost", amount: sc });
  if (st > EPS && scc <= EPS) signals.push({ field: "shipping_total", amount: st });
  if (linePrice > EPS) signals.push({ field: "shipping_lines[0]", amount: linePrice });
  if (optPrice > EPS) signals.push({ field: "shipping_option", amount: optPrice });

  const customerCharge = signals.length ? Math.max(...signals.map((s) => s.amount)) : 0;

  let verdict = "UNKNOWN";
  let customerPaidAmount = 0;

  if (scc > EPS) {
    verdict = "CLIENTE_PAGA";
    customerPaidAmount = scc;
  } else if (sco > EPS && customerCharge <= EPS) {
    verdict = "ENVIO_GRATIS_8Q_ABSORBE";
  } else if (customerCharge > EPS) {
    verdict = "CLIENTE_PAGA";
    customerPaidAmount = customerCharge;
  } else {
    verdict = "AMBIGUO";
  }

  return { verdict, customerPaidAmount };
}

function proposeClienteRepair(truth, erpSoc) {
  if (truth.verdict !== "CLIENTE_PAGA" || truth.customerPaidAmount <= EPS) return null;
  const scc = truth.customerPaidAmount;
  return {
    shippingCustomerCost: scc,
    envioOwner: "CLIENTE",
    shippingOwnerCost: 0,
    socMoved: Math.max(0, erpSoc - 0),
  };
}

function headerNeedsRepair(erp, proposed) {
  return (
    normOwner(erp.eo) !== "CLIENTE" ||
    Math.abs(erp.scc - proposed.shippingCustomerCost) > TOL ||
    Math.abs(erp.soc - 0) > TOL
  );
}

function tnConfig() {
  return {
    store: process.env.TIENDANUBE_STORE_ID,
    token: process.env.TIENDANUBE_ACCESS_TOKEN,
    ua: process.env.TIENDANUBE_USER_AGENT || "8Q ERP",
  };
}

async function tnFetchOrder(orderId) {
  const { store, token, ua } = tnConfig();
  const res = await fetch(`${TN_BASE}/${store}/orders/${orderId}`, {
    headers: {
      Authentication: `bearer ${token}`,
      "User-Agent": ua,
      "Content-Type": "application/json",
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* */
  }
  return { ok: res.ok, json };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function withinPct(actual, expected, pct = 0.02) {
  if (!expected) return actual === 0;
  return Math.abs(actual - expected) <= Math.max(5, expected * pct);
}

async function loadSheetData(sheets) {
  const [resR, resI] = await Promise.all([
    sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: "REMITOS!A:ZZ" }),
    sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: "REMITO_ITEMS!A:ZZ" }),
  ]);

  const rowsR = resR.data.values || [];
  const rowsI = resI.data.values || [];
  const hdrR = rowsR[0].map((h) => String(h || "").trim());
  const hdrI = rowsI[0].map((h) => String(h || "").trim());

  const idxId = pickIdx(hdrR, ["ID Remito"]);
  const idxFecha = pickIdx(hdrR, ["Fecha"]);
  const idxOwner = pickIdx(hdrR, ["Envio Owner", "Envío Owner"]);
  const idxSoc = pickIdx(hdrR, ["Shipping Owner Cost"]);
  const idxScc = pickIdx(hdrR, ["Shipping Customer Cost"]);
  const idxTn = pickIdx(hdrR, ["TN_ORDER_ID"]);
  const idxDet = pickIdx(hdrR, ["Detalle general"]);

  const iRID = pickIdx(hdrI, ["ID Remito"]);
  const iShip = pickIdx(hdrI, ["SHIPPING_ASIGNADO"]);

  const itemsByRemito = new Map();
  const itemRowsByRemito = new Map();
  for (let r = 1; r < rowsI.length; r++) {
    const row = rowsI[r];
    const rid = String(row[iRID] || "").trim();
    if (!rid) continue;
    const ship = num(row[iShip]);
    if (!itemsByRemito.has(rid)) {
      itemsByRemito.set(rid, []);
      itemRowsByRemito.set(rid, []);
    }
    itemsByRemito.get(rid).push(ship);
    itemRowsByRemito.get(rid).push({ sheetRow: r + 1, ship });
  }

  const cohort = [];
  for (let i = 1; i < rowsR.length; i++) {
    const row = rowsR[i];
    const idRemito = String(row[idxId] || "").trim();
    if (!idRemito) continue;
    const fecha = parseDate(row[idxFecha]);
    if (!inRange(fecha, FROM, TO)) continue;

    const scc = idxScc >= 0 ? num(row[idxScc]) : 0;
    const soc = idxSoc >= 0 ? num(row[idxSoc]) : 0;
    const eo = normOwner(row[idxOwner]);
    if (eo !== "8Q" || soc <= EPS || scc > EPS) continue;

    let tnId = idxTn >= 0 ? String(row[idxTn] || "").trim() : "";
    if (!tnId && idxDet >= 0) {
      const m = String(row[idxDet] || "").match(/TN_ORDER_ID=(\d+)/i);
      if (m) tnId = m[1];
    }

    cohort.push({
      idRemito,
      sheetRowR: i + 1,
      month: dayKey(fecha).slice(0, 7),
      tnId,
      erp: { scc, soc, eo },
    });
  }

  return {
    rowsR,
    rowsI,
    hdrR,
    hdrI,
    idxOwner,
    idxSoc,
    idxScc,
    iShip,
    colScc: colToA1(idxScc),
    colOwner: colToA1(idxOwner),
    colSoc: colToA1(idxSoc),
    colShip: colToA1(iShip),
    cohort,
    itemsByRemito,
    itemRowsByRemito,
  };
}

async function buildRepairPlan(sheets, data) {
  const { cohort, itemsByRemito, itemRowsByRemito } = data;
  const { store, token } = tnConfig();
  if (!store || !token) throw new Error("Faltan TIENDANUBE_* en .env.local");

  const repairs = [];
  const stats = {
    cohortSize: cohort.length,
    needsRepair: 0,
    skippedCorrect8q: 0,
    ambiguous: 0,
    tnErrors: 0,
    socToSccAmount: 0,
    itemCellsToClear: 0,
    sumShipToClear: 0,
    byMonth: {},
    samples: [],
  };

  for (let i = 0; i < cohort.length; i++) {
    const r = cohort[i];
    if (!stats.byMonth[r.month]) {
      stats.byMonth[r.month] = { needsRepair: 0, socToSccAmount: 0, itemCellsToClear: 0 };
    }

    if (!r.tnId) {
      stats.ambiguous++;
      continue;
    }

    const det = await tnFetchOrder(r.tnId);
    if (!det.ok || !det.json) {
      stats.tnErrors++;
      continue;
    }

    const truth = tnShippingTruth(det.json);
    const proposed = proposeClienteRepair(truth, r.erp.soc);

    if (!proposed) {
      stats.skippedCorrect8q++;
      continue;
    }

    if (!headerNeedsRepair(r.erp, proposed)) {
      stats.skippedCorrect8q++;
      continue;
    }

    const ships = itemsByRemito.get(r.idRemito) || [];
    const itemRows = itemRowsByRemito.get(r.idRemito) || [];
    const sumShip = Math.round(ships.reduce((a, b) => a + b, 0) * 100) / 100;
    const cellsToClear = itemRows.filter((it) => it.ship > EPS);

    stats.needsRepair++;
    stats.socToSccAmount += proposed.socMoved;
    stats.byMonth[r.month].needsRepair++;
    stats.byMonth[r.month].socToSccAmount += proposed.socMoved;
    stats.itemCellsToClear += cellsToClear.length;
    stats.sumShipToClear += sumShip;
    stats.byMonth[r.month].itemCellsToClear += cellsToClear.length;

    const repair = {
      idRemito: r.idRemito,
      sheetRowR: r.sheetRowR,
      tnOrderId: r.tnId,
      month: r.month,
      tnVerdict: truth.verdict,
      before: {
        shippingCustomerCost: r.erp.scc,
        envioOwner: r.erp.eo,
        shippingOwnerCost: r.erp.soc,
        sumItemShipping: sumShip,
      },
      after: {
        shippingCustomerCost: proposed.shippingCustomerCost,
        envioOwner: proposed.envioOwner,
        shippingOwnerCost: proposed.shippingOwnerCost,
      },
      itemClears: cellsToClear.map((it) => it.sheetRow),
    };
    repairs.push(repair);

    if (stats.samples.length < 10) stats.samples.push(repair);

    if ((i + 1) % 25 === 0) console.error(`[plan] ${i + 1}/${cohort.length}…`);
    await sleep(180);
  }

  return { repairs, stats };
}

async function applyRepairs(sheets, data, repairs) {
  const { colScc, colOwner, colSoc, colShip } = data;
  const updates = [];

  for (const r of repairs) {
    updates.push({
      range: `REMITOS!${colScc}${r.sheetRowR}`,
      values: [[r.after.shippingCustomerCost]],
    });
    updates.push({
      range: `REMITOS!${colOwner}${r.sheetRowR}`,
      values: [[r.after.envioOwner]],
    });
    updates.push({
      range: `REMITOS!${colSoc}${r.sheetRowR}`,
      values: [[r.after.shippingOwnerCost]],
    });
    for (const sheetRow of r.itemClears) {
      updates.push({
        range: `REMITO_ITEMS!${colShip}${sheetRow}`,
        values: [[0]],
      });
    }
  }

  const BATCH = 500;
  for (let b = 0; b < updates.length; b += BATCH) {
    const chunk = updates.slice(b, b + BATCH);
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { valueInputOption: "RAW", data: chunk },
    });
    console.error(`[execute] batch ${b + chunk.length}/${updates.length}`);
  }

  return { updateCells: updates.length, remitos: repairs.length };
}

async function reauditItems(sheets) {
  const data = await loadSheetData(sheets);
  const { rowsR, rowsI, hdrR, idxOwner, idxSoc, idxScc, iShip } = data;
  const idxId = pickIdx(hdrR, ["ID Remito"]);
  const idxFecha = pickIdx(hdrR, ["Fecha"]);
  const iRID = pickIdx(data.hdrI, ["ID Remito"]);

  let badCliente = 0;
  let bad8q = 0;
  let clienteRemitos = 0;
  let ochoqRemitos = 0;

  const itemsSum = new Map();
  for (let r = 1; r < rowsI.length; r++) {
    const row = rowsI[r];
    const rid = String(row[iRID] || "").trim();
    if (!rid) continue;
    itemsSum.set(rid, (itemsSum.get(rid) || 0) + num(row[iShip]));
  }

  for (let i = 1; i < rowsR.length; i++) {
    const row = rowsR[i];
    const id = String(row[idxId] || "").trim();
    if (!id) continue;
    if (!inRange(parseDate(row[idxFecha]), FROM, TO)) continue;

    const eo = normOwner(row[idxOwner]);
    const scc = num(row[idxScc]);
    const soc = num(row[idxSoc]);
    const sumShip = Math.round((itemsSum.get(id) || 0) * 100) / 100;

    if (eo === "CLIENTE" && scc > EPS) {
      clienteRemitos++;
      if (soc > EPS || sumShip > EPS) badCliente++;
    } else if (eo === "8Q" && soc > EPS) {
      ochoqRemitos++;
      const diff = Math.abs(sumShip - soc);
      if (scc > EPS || diff > Math.max(1, soc * 0.08)) bad8q++;
    }
  }

  return { clienteRemitos, ochoqRemitos, badCliente, bad8q };
}

async function countMisclassifiedCohort(sheets) {
  const data = await loadSheetData(sheets);
  const { cohort } = data;
  const { store, token } = tnConfig();
  let mis = 0;

  for (let i = 0; i < cohort.length; i++) {
    const r = cohort[i];
    if (!r.tnId) continue;
    const det = await tnFetchOrder(r.tnId);
    if (!det.ok || !det.json) continue;
    const truth = tnShippingTruth(det.json);
    const proposed = proposeClienteRepair(truth, r.erp.soc);
    if (proposed && headerNeedsRepair(r.erp, proposed)) mis++;
    if ((i + 1) % 50 === 0) console.error(`[reaudit-header] ${i + 1}/${cohort.length}`);
    await sleep(120);
  }
  return { cohortSize: cohort.length, stillMisclassified: mis };
}

async function main() {
  loadEnvLocal();
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = (process.env.GOOGLE_SERVICE_ACCOUNT_KEY || "").replace(/\\n/g, "\n");
  if (!email || !key) throw new Error("Faltan credenciales Google");

  const scopes = execute
    ? ["https://www.googleapis.com/auth/spreadsheets"]
    : ["https://www.googleapis.com/auth/spreadsheets.readonly"];

  const auth = new google.auth.JWT({ email, key, scopes });
  const sheets = google.sheets({ version: "v4", auth });

  if (execute && fromPlan && fs.existsSync(PLAN_PATH)) {
    const plan = JSON.parse(fs.readFileSync(PLAN_PATH, "utf8"));
    const data = await loadSheetData(sheets);
    const applied = await applyRepairs(sheets, data, plan.repairs);
    const report = {
      ok: true,
      dryRun: false,
      fromPlan: true,
      applied,
      planStats: plan.stats,
    };
    fs.writeFileSync("/tmp/repair_shipping_header_execute.json", JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const data = await loadSheetData(sheets);

  let repairs;
  let stats;

  if (execute && fs.existsSync(PLAN_PATH) && !fromPlan) {
    const plan = JSON.parse(fs.readFileSync(PLAN_PATH, "utf8"));
    repairs = plan.repairs;
    stats = plan.stats;
  } else {
    const built = await buildRepairPlan(sheets, data);
    repairs = built.repairs;
    stats = built.stats;
  }

  const scopeOk =
    withinPct(stats.needsRepair, EXPECTED.remitos, 0.02) &&
    withinPct(stats.socToSccAmount, EXPECTED.socToScc, 0.02) &&
    withinPct(stats.itemCellsToClear, EXPECTED.itemCells, 0.02) &&
    stats.tnErrors === 0 &&
    stats.ambiguous === 0;

  stats.expected = EXPECTED;
  stats.scopeMatchesExpected = scopeOk;

  const plan = {
    ok: true,
    dryRun,
    from: FROM,
    to: TO,
    generatedAt: new Date().toISOString(),
    stats,
    repairs,
  };

  fs.writeFileSync(PLAN_PATH, JSON.stringify(plan, null, 2));

  if (dryRun) {
    const out = "/tmp/repair_shipping_header_dryrun.json";
    fs.writeFileSync(out, JSON.stringify({ stats, samples: stats.samples }, null, 2));
    console.log(JSON.stringify(stats, null, 2));
    console.error(`Wrote ${PLAN_PATH} and ${out}`);
    if (!scopeOk) {
      console.error("DRY-RUN NO COINCIDE con alcance esperado — no ejecutar --execute");
      process.exit(2);
    }
    return;
  }

  if (!scopeOk) {
    console.error("Plan no coincide con alcance esperado — abortando execute");
    process.exit(2);
  }

  const applied = await applyRepairs(sheets, data, repairs);
  const itemsAudit = await reauditItems(sheets);
  const headerReaudit = await countMisclassifiedCohort(sheets);

  const finalReport = {
    ok: true,
    dryRun: false,
    execute: applied,
    dryRunStats: stats,
    reaudit: { items: itemsAudit, headerCohort: headerReaudit },
    samples: stats.samples,
  };

  fs.writeFileSync("/tmp/repair_shipping_header_execute.json", JSON.stringify(finalReport, null, 2));
  console.log(JSON.stringify(finalReport, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
