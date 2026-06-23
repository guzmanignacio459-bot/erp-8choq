/**
 * FASE C — Auditoría read-only residuales shipping (sin escritura).
 *   node scripts/audit-shipping-phase-c.mjs
 */

import fs from "fs";
import path from "path";
import { google } from "googleapis";

const SPREADSHEET_ID =
  process.env.GOOGLE_SPREADSHEET_ID || "1EDHbX270hNB_BoMfY2iBWJ-CRl5EJWrDKxudUJ1eGWo";
const FROM = "2026-04-01";
const TO = "2026-05-31";
const APRIL = "2026-04";
const EPS = 0.02;
const TOL_FRAC = 0.08;
const TZ = "America/Argentina/Buenos_Aires";
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

function tnShippingTruth(order) {
  const scc = num(order?.shipping_cost_customer);
  const sco = num(order?.shipping_cost_owner);
  return { scc, sco, bothEqual: scc > EPS && sco > EPS && Math.abs(scc - sco) <= TOL_FRAC * Math.max(scc, sco) };
}

async function tnFetch(orderId) {
  const store = process.env.TIENDANUBE_STORE_ID;
  const token = process.env.TIENDANUBE_ACCESS_TOKEN;
  const ua = process.env.TIENDANUBE_USER_AGENT || "8Q ERP";
  const res = await fetch(`${TN_BASE}/${store}/orders/${orderId}`, {
    headers: {
      Authentication: `bearer ${token}`,
      "User-Agent": ua,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) return { ok: false, status: res.status };
  return { ok: true, json: await res.json() };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function classifyDual(r, tn) {
  if (!tn?.ok) return { category: "B", motive: "Sin TN — revisar manual" };
  const t = tnShippingTruth(tn.json);
  if (t.scc > EPS && t.sco > EPS && Math.abs(t.scc - t.sco) <= Math.max(1, t.scc * 0.02)) {
    if (r.sumShip <= EPS) {
      return {
        category: "A",
        motive:
          "TN confirma cobro al cliente (SCC=SCO). Cabecera debería ser CLIENTE/SOC=0; ítems en 0 OK. Bug GAS pre-Fase B: ambos costos persistidos con Owner 8Q.",
      };
    }
    return {
      category: "A",
      motive: "TN cliente pagó; cabecera 8Q con SCC=SOC inconsistente con regla definitiva.",
    };
  }
  if (t.scc <= EPS && t.sco > EPS) {
    return {
      category: "B",
      motive: "TN envío gratis (cliente 0); SCC en sheet residual legacy — cabecera Owner 8Q correcta en SOC.",
    };
  }
  return { category: "B", motive: "TN ambiguo o distinto a SCC=SOC duplicado." };
}

function classifyDev(r, tn) {
  const items = r.itemCount || 0;
  if (items === 0) {
    return {
      category: "A",
      motive: "Remito sin filas REMITO_ITEMS — SOC>0 pero nada que prorratear.",
    };
  }
  if (!tn?.ok) {
    return { category: "B", motive: "Desvío ítems — verificar import/stock sin TN." };
  }
  const t = tnShippingTruth(tn.json);
  if (t.scc > EPS) {
    return {
      category: "A",
      motive: "TN indica cliente pagó; debería ser CLIENTE y ship ítems 0 (no quedó en reparación 585).",
    };
  }
  if (r.sumShip <= EPS && t.sco > EPS) {
    return {
      category: "A",
      motive:
        "8Q gratis en TN pero Σ ítems=0 — falta prorrateo histórico (no entró en limpieza CLIENTE ni repair 8Q items).",
    };
  }
  const diff = Math.abs(r.sumShip - r.soc);
  if (diff <= Math.max(1, r.soc * 0.02)) {
    return { category: "C", motive: "Dentro de tolerancia de redondeo centavos." };
  }
  return {
    category: "B",
    motive: `Desvío ${diff.toFixed(2)} — posible redondeo prorrateo o edición manual parcial.`,
  };
}

async function main() {
  loadEnvLocal();
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = (process.env.GOOGLE_SERVICE_ACCOUNT_KEY || "").replace(/\\n/g, "\n");
  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  const [resR, resI] = await Promise.all([
    sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: "REMITOS!A:ZZ" }),
    sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: "REMITO_ITEMS!A:ZZ" }),
  ]);

  const hdrR = resR.data.values[0].map((h) => String(h || "").trim());
  const hdrI = resI.data.values[0].map((h) => String(h || "").trim());
  const idxId = pickIdx(hdrR, ["ID Remito"]);
  const idxFecha = pickIdx(hdrR, ["Fecha"]);
  const idxOwner = pickIdx(hdrR, ["Envio Owner", "Envío Owner"]);
  const idxSoc = pickIdx(hdrR, ["Shipping Owner Cost"]);
  const idxScc = pickIdx(hdrR, ["Shipping Customer Cost"]);
  const idxTn = pickIdx(hdrR, ["TN_ORDER_ID"]);
  const idxDet = pickIdx(hdrR, ["Detalle general"]);
  const idxPrendas = pickIdx(hdrR, ["Total De Prendas"]);

  const iRID = pickIdx(hdrI, ["ID Remito"]);
  const iShip = pickIdx(hdrI, ["SHIPPING_ASIGNADO"]);

  const sumItems = new Map();
  const itemCount = new Map();
  for (let r = 1; r < resI.data.values.length; r++) {
    const row = resI.data.values[r];
    const id = String(row[iRID] || "").trim();
    if (!id) continue;
    itemCount.set(id, (itemCount.get(id) || 0) + 1);
    sumItems.set(id, (sumItems.get(id) || 0) + num(row[iShip]));
  }

  const dualApril = [];
  const dualAprMay = [];
  const dev8q = [];

  for (let i = 1; i < resR.data.values.length; i++) {
    const row = resR.data.values[i];
    const idRemito = String(row[idxId] || "").trim();
    if (!idRemito) continue;
    const fecha = parseDate(row[idxFecha]);
    if (!inRange(fecha, FROM, TO)) continue;

    const eo = normOwner(row[idxOwner]);
    const scc = num(row[idxScc]);
    const soc = num(row[idxSoc]);
    const sumShip = Math.round((sumItems.get(idRemito) || 0) * 100) / 100;
    const mk = dayKey(fecha).slice(0, 7);

    let tnId = idxTn >= 0 ? String(row[idxTn] || "").trim() : "";
    if (!tnId && idxDet >= 0) {
      const m = String(row[idxDet] || "").match(/TN_ORDER_ID=(\d+)/i);
      if (m) tnId = m[1];
    }

    const base = {
      idRemito,
      tnOrderId: tnId,
      fecha: String(row[idxFecha] || ""),
      month: mk,
      scc,
      soc,
      envioOwner: eo,
      sumShip,
      itemCount: itemCount.get(idRemito) || 0,
      totalPrendas: idxPrendas >= 0 ? num(row[idxPrendas]) : 0,
    };

    if (eo === "8Q" && scc > EPS && soc > EPS) {
      dualAprMay.push(base);
      if (mk === APRIL) dualApril.push(base);
    }

    if (eo === "8Q" && soc > EPS && scc <= EPS) {
      const diff = Math.abs(sumShip - soc);
      if (diff > Math.max(1, soc * TOL_FRAC)) {
        dev8q.push({ ...base, diff });
      }
    }
  }

  const allTargets = [...dualAprMay, ...dev8q];
  const tnCache = new Map();
  for (const r of allTargets) {
    if (!r.tnOrderId || tnCache.has(r.tnOrderId)) continue;
    tnCache.set(r.tnOrderId, await tnFetch(r.tnOrderId));
    await sleep(200);
  }

  for (const r of dualApril) {
    const tn = tnCache.get(r.tnOrderId);
    const c = classifyDual(r, tn);
    r.tn = tn?.ok ? tnShippingTruth(tn.json) : null;
    r.category = c.category;
    r.probableCause = c.motive;
  }
  for (const r of dualAprMay.filter((x) => !dualApril.find((d) => d.idRemito === x.idRemito))) {
    const tn = tnCache.get(r.tnOrderId);
    const c = classifyDual(r, tn);
    r.tn = tn?.ok ? tnShippingTruth(tn.json) : null;
    r.category = c.category;
    r.probableCause = c.motive;
    r.note = "Mayo (fuera conteo 12 Abril original)";
  }
  for (const r of dev8q) {
    const tn = tnCache.get(r.tnOrderId);
    const c = classifyDev(r, tn);
    r.tn = tn?.ok ? tnShippingTruth(tn.json) : null;
    r.category = c.category;
    r.probableCause = c.motive;
  }

  const report = {
    generatedAt: new Date().toISOString(),
    scope: { from: FROM, to: TO },
    summary: {
      dualAprilCount: dualApril.length,
      dualAprMayCount: dualAprMay.length,
      dev8qCount: dev8q.length,
      noteApril12:
        "Conteo '12' de sesión previa usaba filtro distinto (incl. remitos R-177107* 1/4 con SCC=SOC). Hoy en Abr 2026-04 estricto: " +
        dualApril.length,
    },
    dualApril,
    dualMayOnly: dualAprMay.filter((x) => x.month === "2026-05"),
    dev8q,
    categories: {
      A: "Requiere corrección si se busca perfección total",
      B: "Explicable / legacy / no bloquea MP",
      C: "Irrelevante tolerancia",
    },
  };

  const out = "/tmp/audit_shipping_phase_c.json";
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.summary, null, 2));
  console.error(`Wrote ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
