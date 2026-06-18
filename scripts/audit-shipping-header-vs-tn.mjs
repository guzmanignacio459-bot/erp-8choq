/**
 * Diagnóstico: cabecera REMITOS shipping vs Tiendanube (solo lectura).
 * Patrón ERP sospechoso: SCC=0, Envio Owner=8Q, SOC>0
 *
 *   node scripts/audit-shipping-header-vs-tn.mjs
 */

import fs from "fs";
import path from "path";
import { google } from "googleapis";

const SPREADSHEET_ID =
  process.env.GOOGLE_SPREADSHEET_ID || "1EDHbX270hNB_BoMfY2iBWJ-CRl5EJWrDKxudUJ1eGWo";
const FROM = process.env.AUDIT_FROM || "2026-04-01";
const TO = process.env.AUDIT_TO || "2026-05-31";
const TZ = "America/Argentina/Buenos_Aires";
const EPS = 0.02;
const TOL = 1.5;

const TN_BASE = "https://api.tiendanube.com/v1";

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

/** Réplica lógica Next getShippingPaid / getShippingOwnerCost */
function nextGetShippingPaid(order) {
  const customer = num(order?.shipping_cost_customer);
  if (customer > EPS) return customer;
  const owner = num(order?.shipping_cost_owner);
  if (owner > EPS) return 0;
  return firstMoney(
    order?.shipping_cost_customer,
    order?.shipping_cost,
    order?.shipping_total,
    order?.shipping_option?.cost,
    order?.shipping_option?.price,
    order?.shipping_lines?.[0]?.price,
    order?.shipping_lines?.[0]?.cost,
    order?.shipping?.cost,
    order?.shipping?.price
  );
}

function nextGetShippingOwnerCost(order) {
  return num(order?.shipping_cost_owner);
}

function nextClassify(order) {
  const shippingPaid = nextGetShippingPaid(order);
  const shippingOwnerCost = nextGetShippingOwnerCost(order);
  const costoEnvioOwner =
    shippingPaid > EPS ? 0 : shippingOwnerCost > EPS ? shippingOwnerCost : 0;
  const envioOwner =
    shippingPaid > EPS ? "CLIENTE" : costoEnvioOwner > EPS ? "8Q" : "SIN_DATO";
  return { shippingPaid, shippingOwnerCost, costoEnvioOwner, envioOwner };
}

/**
 * Verdad de negocio desde TN (independiente del bug de Next).
 * CLIENTE pagó si hay señal explícita de cobro al cliente.
 */
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

  // Ambos iguales y >0: TN suele duplicar el cobro al cliente en owner
  if (scc > EPS && sco > EPS && Math.abs(scc - sco) <= TOL) {
    signals.push({ field: "customer_and_owner_equal", amount: scc });
  }

  if (sc > EPS && scc <= EPS) {
    signals.push({ field: "shipping_cost", amount: sc });
  }
  if (st > EPS && scc <= EPS) signals.push({ field: "shipping_total", amount: st });
  if (linePrice > EPS) signals.push({ field: "shipping_lines[0]", amount: linePrice });
  if (optPrice > EPS) signals.push({ field: "shipping_option", amount: optPrice });

  const customerCharge = signals.length
    ? Math.max(...signals.map((s) => s.amount))
    : 0;

  let verdict = "UNKNOWN";
  let customerPaidAmount = 0;
  let ownerAbsorbAmount = 0;
  let freeShippingForCustomer = false;

  if (scc > EPS) {
    verdict = "CLIENTE_PAGA";
    customerPaidAmount = scc;
    ownerAbsorbAmount = sco > EPS && Math.abs(sco - scc) > TOL ? sco : 0;
  } else if (sco > EPS && customerCharge <= EPS) {
    // Sin señal de cobro al cliente → envío gratis para el cliente, 8Q absorbe
    verdict = "ENVIO_GRATIS_8Q_ABSORBE";
    customerPaidAmount = 0;
    ownerAbsorbAmount = sco;
    freeShippingForCustomer = true;
  } else if (customerCharge > EPS) {
    verdict = "CLIENTE_PAGA";
    customerPaidAmount = customerCharge;
    ownerAbsorbAmount = sco;
  } else if (sco <= EPS && sc <= EPS && st <= EPS) {
    verdict = "SIN_ENVIO";
    freeShippingForCustomer = true;
  } else if (impliedGap > EPS && sco > EPS && Math.abs(impliedGap - sco) <= Math.max(TOL, sco * 0.05)) {
    // total incluye envío ≈ owner cost pero customer=0 → ambiguo; marcar revisión
    verdict = "AMBIGUO_GAP_TOTAL";
    ownerAbsorbAmount = sco;
    customerPaidAmount = 0;
  } else {
    verdict = "AMBIGUO";
    ownerAbsorbAmount = sco;
    customerPaidAmount = customerCharge;
  }

  return {
    verdict,
    customerPaidAmount,
    ownerAbsorbAmount,
    freeShippingForCustomer,
    raw: { scc, sco, sc, st, linePrice, optPrice, impliedGap },
    signals,
  };
}

function near(a, b) {
  return Math.abs(a - b) <= Math.max(TOL, Math.max(Math.abs(a), Math.abs(b)) * 0.02);
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
  const url = `${TN_BASE}/${store}/orders/${orderId}`;
  const res = await fetch(url, {
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
  return { ok: res.ok, status: res.status, json, text: text.slice(0, 200) };
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

  const resR = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: "REMITOS!A:ZZ",
  });
  const rowsR = resR.data.values || [];
  const hdrR = rowsR[0].map((h) => String(h || "").trim());
  const idxId = pickIdx(hdrR, ["ID Remito"]);
  const idxFecha = pickIdx(hdrR, ["Fecha"]);
  const idxOwner = pickIdx(hdrR, ["Envio Owner", "Envío Owner"]);
  const idxSoc = pickIdx(hdrR, ["Shipping Owner Cost"]);
  const idxScc = pickIdx(hdrR, ["Shipping Customer Cost", "Costo De Envio", "Costo Envio"]);
  const idxTn = pickIdx(hdrR, ["TN_ORDER_ID"]);
  const idxDet = pickIdx(hdrR, ["Detalle general"]);
  const idxVendedor = pickIdx(hdrR, ["Vendedor"]);

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

    // Patrón sospechoso: cliente no cobrado en ERP pero owner 8Q con costo
    if (eo !== "8Q" || soc <= EPS || scc > EPS) continue;

    let tnId = idxTn >= 0 ? String(row[idxTn] || "").trim() : "";
    if (!tnId && idxDet >= 0) {
      const m = String(row[idxDet] || "").match(/TN_ORDER_ID=(\d+)/i);
      if (m) tnId = m[1];
    }

    cohort.push({
      idRemito,
      month: dayKey(fecha).slice(0, 7),
      erp: { scc, soc, eo },
      tnId,
      vendedor: idxVendedor >= 0 ? String(row[idxVendedor] || "").trim() : "",
    });
  }

  const report = {
    ok: true,
    from: FROM,
    to: TO,
    cohortSize: cohort.length,
    withTnId: cohort.filter((r) => r.tnId).length,
    tnFetchErrors: 0,
    misclassifiedClientePaga: [],
    correct8qGratis: [],
    ambiguous: [],
    sinTnId: [],
    summary: {},
  };

  const byMonth = {};
  let misCount = 0;
  let misAmount = 0;
  let ok8q = 0;
  let ambig = 0;

  for (let i = 0; i < cohort.length; i++) {
    const r = cohort[i];
    if (!byMonth[r.month]) {
      byMonth[r.month] = {
        cohort: 0,
        misclassified: 0,
        misAmount: 0,
        correct8q: 0,
        ambiguous: 0,
        noTn: 0,
      };
    }
    byMonth[r.month].cohort++;

    if (!r.tnId) {
      report.sinTnId.push(r);
      byMonth[r.month].noTn++;
      continue;
    }

    const det = await tnFetchOrder(r.tnId);
    if (!det.ok || !det.json) {
      report.tnFetchErrors++;
      report.ambiguous.push({
        ...r,
        error: `TN ${det.status}`,
        tnSnippet: det.text,
      });
      byMonth[r.month].ambiguous++;
      ambig++;
      await sleep(180);
      continue;
    }

    const order = det.json;
    const truth = tnShippingTruth(order);
    const nextSim = nextClassify(order);

    const row = {
      idRemito: r.idRemito,
      tnOrderId: r.tnId,
      month: r.month,
      erp: r.erp,
      tn: truth.raw,
      tnVerdict: truth.verdict,
      tnCustomerPaid: truth.customerPaidAmount,
      tnOwnerAbsorb: truth.ownerAbsorbAmount,
      tnSignals: truth.signals,
      nextWouldBe: nextSim,
      nextMatchesErp8q:
        nextSim.envioOwner === "8Q" &&
        nextSim.shippingPaid <= EPS &&
        near(nextSim.costoEnvioOwner, r.erp.soc),
    };

    const erpMisCliente =
      truth.verdict === "CLIENTE_PAGA" &&
      truth.customerPaidAmount > EPS &&
      r.erp.eo === "8Q" &&
      r.erp.scc <= EPS &&
      r.erp.soc > EPS;

    if (erpMisCliente) {
      misCount++;
      const amt = r.erp.soc;
      misAmount += amt;
      byMonth[r.month].misclassified++;
      byMonth[r.month].misAmount += amt;
      if (report.misclassifiedClientePaga.length < 25) {
        report.misclassifiedClientePaga.push(row);
      }
    } else if (truth.verdict === "ENVIO_GRATIS_8Q_ABSORBE") {
      ok8q++;
      byMonth[r.month].correct8q++;
      if (report.correct8qGratis.length < 8) report.correct8qGratis.push(row);
    } else {
      ambig++;
      byMonth[r.month].ambiguous++;
      if (report.ambiguous.length < 15) report.ambiguous.push(row);
    }

    if ((i + 1) % 25 === 0) {
      console.error(`[audit] ${i + 1}/${cohort.length} TN fetched…`);
    }
    await sleep(200);
  }

  report.summary = {
    cohortSize: cohort.length,
    misclassifiedCount: misCount,
    misclassifiedOwnerCostTotal: Math.round(misAmount * 100) / 100,
    correct8qGratisCount: ok8q,
    ambiguousOrUnknown: ambig + report.sinTnId.length + report.tnFetchErrors,
    byMonth,
    rootCause:
      "Next import-orders getShippingPaid(): si shipping_cost_customer=0 y shipping_cost_owner>0 devuelve 0 al cliente y clasifica 8Q. GAS saveRemito repite: si SOC>0 → Envio Owner=8Q.",
    codeRefs: [
      "app/api/tiendanube/orders-paid/import-orders/route.ts — getShippingPaid(), buildRemitoPayload()",
      "app-script/erp-8q.gs — saveRemito envioOwnerFinal (SOC>0 → 8Q)",
    ],
  };

  const outPath = "/tmp/audit_shipping_header_vs_tn.json";
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.summary, null, 2));
  console.error(`Wrote ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
