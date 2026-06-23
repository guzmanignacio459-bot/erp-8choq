/**
 * Fase B — Dry-run reparación cabecera REMITOS shipping (sin escritura).
 * Cohorte: Abr/Mayo, patrón sospechoso SCC=0, Owner=8Q, SOC>0.
 * Compara TN vs ERP y propone cabecera + impacto en REMITO_ITEMS.
 *
 *   node scripts/repair-shipping-header-dryrun.mjs
 *   node scripts/repair-shipping-header-dryrun.mjs --limit=50
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

const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? Number(limitArg.split("=")[1]) : 0;

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

  const subtotal = num(order?.subtotal ?? order?.subtotal_price ?? order?.total_products);
  const total = num(order?.total ?? order?.total_price ?? order?.total_paid);
  const discount = num(order?.discount ?? order?.discount_total ?? order?.total_discounts);
  const impliedGap = Math.round((total - subtotal + discount) * 100) / 100;

  const signals = [];
  if (scc > EPS) signals.push({ field: "shipping_cost_customer", amount: scc });
  if (sc > EPS && scc <= EPS) signals.push({ field: "shipping_cost", amount: sc });
  if (st > EPS && scc <= EPS) signals.push({ field: "shipping_total", amount: st });
  if (linePrice > EPS) signals.push({ field: "shipping_lines[0]", amount: linePrice });
  if (optPrice > EPS) signals.push({ field: "shipping_option", amount: optPrice });

  const customerCharge = signals.length ? Math.max(...signals.map((s) => s.amount)) : 0;

  let verdict = "UNKNOWN";
  let customerPaidAmount = 0;
  let ownerAbsorbAmount = 0;

  if (scc > EPS) {
    verdict = "CLIENTE_PAGA";
    customerPaidAmount = scc;
    ownerAbsorbAmount = sco > EPS && Math.abs(sco - scc) > TOL ? sco : 0;
  } else if (sco > EPS && customerCharge <= EPS) {
    verdict = "ENVIO_GRATIS_8Q_ABSORBE";
    customerPaidAmount = 0;
    ownerAbsorbAmount = sco;
  } else if (customerCharge > EPS) {
    verdict = "CLIENTE_PAGA";
    customerPaidAmount = customerCharge;
    ownerAbsorbAmount = sco;
  } else if (sco <= EPS && sc <= EPS && st <= EPS) {
    verdict = "SIN_ENVIO";
  } else if (
    impliedGap > EPS &&
    sco > EPS &&
    Math.abs(impliedGap - sco) <= Math.max(TOL, sco * 0.05)
  ) {
    verdict = "AMBIGUO_GAP_TOTAL";
    ownerAbsorbAmount = sco;
  } else {
    verdict = "AMBIGUO";
    ownerAbsorbAmount = sco;
    customerPaidAmount = customerCharge;
  }

  return {
    verdict,
    customerPaidAmount,
    ownerAbsorbAmount,
    raw: { scc, sco, sc, st, linePrice, optPrice, impliedGap },
    signals,
  };
}

/** Cabecera objetivo según regla de negocio definitiva. */
function proposeHeader(truth) {
  if (truth.verdict === "CLIENTE_PAGA" && truth.customerPaidAmount > EPS) {
    return {
      shippingCustomerCost: truth.customerPaidAmount,
      envioOwner: "CLIENTE",
      shippingOwnerCost: 0,
      itemsRule: "ZERO_SHIPPING_ASIGNADO",
    };
  }
  if (truth.verdict === "ENVIO_GRATIS_8Q_ABSORBE" && truth.ownerAbsorbAmount > EPS) {
    return {
      shippingCustomerCost: 0,
      envioOwner: "8Q",
      shippingOwnerCost: truth.ownerAbsorbAmount,
      itemsRule: "PRORATE_OWNER_COST",
    };
  }
  if (truth.verdict === "SIN_ENVIO") {
    return {
      shippingCustomerCost: 0,
      envioOwner: "",
      shippingOwnerCost: 0,
      itemsRule: "ZERO_SHIPPING_ASIGNADO",
    };
  }
  return null;
}

function headerDiffers(erp, proposed) {
  if (!proposed) return false;
  return (
    normOwner(erp.eo) !== normOwner(proposed.envioOwner) ||
    Math.abs(erp.scc - proposed.shippingCustomerCost) > TOL ||
    Math.abs(erp.soc - proposed.shippingOwnerCost) > TOL
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
  return { ok: res.ok, status: res.status, json };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  loadEnvLocal();
  const { store, token } = tnConfig();
  if (!store || !token) throw new Error("Faltan TIENDANUBE_* en .env.local");

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = (process.env.GOOGLE_SERVICE_ACCOUNT_KEY || "").replace(/\\n/g, "\n");
  if (!email || !key) throw new Error("Faltan credenciales Google");

  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  const [resR, resI] = await Promise.all([
    sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "REMITOS!A:ZZ",
    }),
    sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "REMITO_ITEMS!A:ZZ",
    }),
  ]);

  const rowsR = resR.data.values || [];
  const rowsI = resI.data.values || [];
  const hdrR = rowsR[0].map((h) => String(h || "").trim());
  const idxId = pickIdx(hdrR, ["ID Remito"]);
  const idxFecha = pickIdx(hdrR, ["Fecha"]);
  const idxOwner = pickIdx(hdrR, ["Envio Owner", "Envío Owner"]);
  const idxSoc = pickIdx(hdrR, ["Shipping Owner Cost"]);
  const idxScc = pickIdx(hdrR, ["Shipping Customer Cost", "Costo De Envio", "Costo Envio"]);
  const idxTn = pickIdx(hdrR, ["TN_ORDER_ID"]);
  const idxDet = pickIdx(hdrR, ["Detalle general"]);

  const hdrI = rowsI[0].map((h) => String(h || "").trim());
  const iRID = pickIdx(hdrI, ["ID Remito"]);
  const iShip = pickIdx(hdrI, ["SHIPPING_ASIGNADO"]);

  const itemsByRemito = new Map();
  for (let r = 1; r < rowsI.length; r++) {
    const row = rowsI[r];
    const rid = String(row[iRID] || "").trim();
    if (!rid) continue;
    if (!itemsByRemito.has(rid)) itemsByRemito.set(rid, []);
    itemsByRemito.get(rid).push(num(row[iShip]));
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
      month: dayKey(fecha).slice(0, 7),
      tnId,
      erp: { scc, soc, eo },
    });
  }

  const toProcess = LIMIT > 0 ? cohort.slice(0, LIMIT) : cohort;

  const stats = {
    dryRun: true,
    cohortSize: cohort.length,
    processed: 0,
    needsHeaderRepair: 0,
    alreadyCorrectPerTn: 0,
    ambiguous: 0,
    tnErrors: 0,
    socToSccAmount: 0,
    byMonth: {},
    itemsImpact: {
      clienteZeroCells: 0,
      ochoqProrateCells: 0,
      sumShipToClear: 0,
    },
    samples: [],
  };

  for (let i = 0; i < toProcess.length; i++) {
    const r = toProcess[i];
    stats.processed++;
    if (!stats.byMonth[r.month]) {
      stats.byMonth[r.month] = {
        needsHeaderRepair: 0,
        socToSccAmount: 0,
        clienteZeroCells: 0,
        ochoqProrateCells: 0,
      };
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
    const proposed = proposeHeader(truth);
    if (!proposed) {
      stats.ambiguous++;
      continue;
    }

    if (!headerDiffers(r.erp, proposed)) {
      stats.alreadyCorrectPerTn++;
      continue;
    }

    stats.needsHeaderRepair++;
    stats.byMonth[r.month].needsHeaderRepair++;

    const moved = r.erp.soc - proposed.shippingOwnerCost;
    if (moved > EPS && proposed.shippingCustomerCost > EPS) {
      stats.socToSccAmount += moved;
      stats.byMonth[r.month].socToSccAmount += moved;
    }

    const ships = itemsByRemito.get(r.idRemito) || [];
    const sumShip = Math.round(ships.reduce((a, b) => a + b, 0) * 100) / 100;
    let itemAction = "NONE";
    if (proposed.itemsRule === "ZERO_SHIPPING_ASIGNADO" && sumShip > EPS) {
      itemAction = "CLEAR_SHIPPING_ASIGNADO";
      stats.itemsImpact.clienteZeroCells += ships.length;
      stats.itemsImpact.sumShipToClear += sumShip;
      stats.byMonth[r.month].clienteZeroCells += ships.length;
    } else if (proposed.itemsRule === "PRORATE_OWNER_COST") {
      const diff = Math.abs(sumShip - proposed.shippingOwnerCost);
      if (sumShip <= EPS || diff > Math.max(1, proposed.shippingOwnerCost * 0.08)) {
        itemAction = "PRORATE_SHIPPING_ASIGNADO";
        stats.itemsImpact.ochoqProrateCells += ships.length;
        stats.byMonth[r.month].ochoqProrateCells += ships.length;
      }
    }

    if (stats.samples.length < 12) {
      stats.samples.push({
        idRemito: r.idRemito,
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
        itemAction,
        itemCount: ships.length,
      });
    }

    if ((i + 1) % 25 === 0) {
      console.error(`[dryrun] ${i + 1}/${toProcess.length}…`);
    }
    await sleep(180);
  }

  const report = {
    ok: true,
    dryRun: true,
    from: FROM,
    to: TO,
    limit: LIMIT || null,
    stats,
    note: "No se escribió en Sheets. Ejecutar reparación real solo tras deploy Fase A.",
  };

  const outPath = "/tmp/repair_shipping_header_dryrun.json";
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.stats, null, 2));
  console.error(`Wrote ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
