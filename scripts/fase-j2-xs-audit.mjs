#!/usr/bin/env node
/**
 * FASE J.2 — Auditoría XS + dryRun TN 1986370434
 */

import fs from "fs";
import path from "path";
import { google } from "googleapis";

const PROD =
  process.env.PROD_URL ??
  "https://nextjs-boilerplate-topaz-iota-40.vercel.app";
const BASE = process.argv[2] || PROD;
const TARGET_TN = "1986370434";
const SPREADSHEET_ID =
  process.env.GOOGLE_SPREADSHEET_ID || "1EDHbX270hNB_BoMfY2iBWJ-CRl5EJWrDKxudUJ1eGWo";
const STOCK_SHEET = "STOCK MAESTRO";

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

async function readStockHeaders() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = (process.env.GOOGLE_SERVICE_ACCOUNT_KEY || "").replace(/\\n/g, "\n");
  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${STOCK_SHEET}'!1:1`,
  });
  return (res.data.values?.[0] ?? []).map((h) => String(h || "").trim());
}

async function fetchTnProductsXs() {
  const STORE = process.env.TIENDANUBE_STORE_ID;
  const TNTOKEN = process.env.TIENDANUBE_ACCESS_TOKEN;
  const skus = new Map();
  for (let page = 1; page <= 80; page++) {
    const res = await fetch(
      `https://api.tiendanube.com/v1/${STORE}/products?page=${page}&per_page=200`,
      {
        headers: {
          Authentication: `bearer ${TNTOKEN}`,
          "User-Agent": process.env.TIENDANUBE_USER_AGENT || "8Q",
        },
      }
    );
    const batch = await res.json();
    if (!Array.isArray(batch) || !batch.length) break;
    for (const p of batch) {
      for (const v of p.variants ?? []) {
        const sku = String(v.sku ?? "").trim().toUpperCase();
        if (!sku) continue;
        if (/-XS(?:-SCNL)?$/.test(sku) || sku.endsWith("-XS")) {
          skus.set(sku, {
            sku,
            product: p.name?.es || p.name || "",
            variantId: v.id,
            stock: v.stock,
          });
        }
      }
    }
    if (batch.length < 200) break;
    await new Promise((r) => setTimeout(r, 120));
  }
  return [...skus.values()];
}

async function fetchXsPaidOrders() {
  const STORE = process.env.TIENDANUBE_STORE_ID;
  const TNTOKEN = process.env.TIENDANUBE_ACCESS_TOKEN;
  const orders = [];
  for (let page = 1; page <= 30; page++) {
    const q = new URLSearchParams({
      payment_status: "paid",
      created_at_min: "2026-06-01T00:00:00.000Z",
      created_at_max: "2026-12-31T23:59:59.999Z",
      page: String(page),
      per_page: "200",
    });
    const j = await fetch(
      `https://api.tiendanube.com/v1/${STORE}/orders?${q}`,
      {
        headers: {
          Authentication: `bearer ${TNTOKEN}`,
          "User-Agent": process.env.TIENDANUBE_USER_AGENT || "8Q",
        },
      }
    ).then((r) => r.json());
    if (!Array.isArray(j) || !j.length) break;
    orders.push(...j);
    if (j.length < 200) break;
  }

  const remitos = await fetch(`${PROD}/api/erp/remitos`).then((r) => r.json());
  const erpTn = new Set(
    (remitos.data ?? []).map((r) => String(r.tnOrderId ?? "").trim()).filter(Boolean)
  );

  const xsOrders = [];
  for (const o of orders) {
    const products = o.products ?? [];
    const hasXs = products.some((p) =>
      /-XS(?:-SCNL)?$/i.test(String(p.sku ?? ""))
    );
    if (!hasXs) continue;
    xsOrders.push({
      id: String(o.id),
      status: o.status,
      payment_status: o.payment_status,
      total: o.total,
      skus: products.map((p) => p.sku).filter(Boolean),
      inErp: erpTn.has(String(o.id)),
    });
  }
  return xsOrders;
}

async function dryRunOrder(base) {
  const res = await fetch(`${base}/api/tiendanube/orders-paid/import-orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-import-token": token,
    },
    body: JSON.stringify({
      fromISO: "2026-06-01T03:00:00.000Z",
      toISO: "2026-06-07T02:59:59.999Z",
      singleOrderId: TARGET_TN,
      dryRun: true,
      importMp: false,
    }),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { ok: false, raw: text.slice(0, 300) };
  }
  const preview = json.preview;
  const items = preview?.items ?? [];
  return {
    http: res.status,
    ok: json.ok !== false,
    step: json.step,
    message: json.message,
    wouldImport: json.metrics?.wouldImport,
    errors: json.errors,
    items: items.map((i) => ({
      sku: i.sku,
      talle: i.talle,
      owner: i.owner,
      precioUnitario: i.precioUnitario,
    })),
    totalFinal: preview?.totalFinal,
  };
}

// --- run ---
const stockHeaders = await readStockHeaders();
const xsSkus = await fetchTnProductsXs();
const xsOrders = await fetchXsPaidOrders();
const dryRun = await dryRunOrder(BASE);

const hasXsCol = stockHeaders.includes("XS");
const proposal = {
  action: hasXsCol
    ? "Columna XS ya existe"
    : "Insertar columna C con header XS; desplazar S→D, M→E, L→F, XL→G, XXL→H, XXXL→I, Stock Total→J",
  headersActuales: stockHeaders,
  headersPropuestos: [
    "SKU",
    "ARTICULO",
    "XS",
    "S",
    "M",
    "L",
    "XL",
    "XXL",
    "XXXL",
    "Stock Total",
  ],
  stockTotalFormula:
    "=SUM(C2:I2) reemplazando fórmula actual que suma solo S:XXXL",
};

const hj119 = xsSkus.filter((s) => s.sku.startsWith("HJ119"));
const pendingXs = xsOrders.filter((o) => !o.inErp);

const report = {
  generatedAt: new Date().toISOString(),
  stock: { hasXsCol, ...proposal },
  tnXsSkus: { count: xsSkus.length, samples: xsSkus.slice(0, 30), hj119 },
  xsPaidOrders: {
    total: xsOrders.length,
    pending: pendingXs,
    all: xsOrders,
  },
  dryRun1986370434: dryRun,
  parseExpect: {
    sku: "HJ119-XS",
    talle: "XS",
    skuBase: "HJ119",
  },
};

const out = path.join(process.cwd(), "_wip/fase-j2-xs-audit.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(report, null, 2));

console.log("=== FASE J.2 XS Audit ===");
console.log("STOCK headers:", stockHeaders.join(" | "));
console.log("XS column exists:", hasXsCol);
console.log("TN SKUs ending -XS:", xsSkus.length);
console.log("HJ119 variants:", hj119);
console.log("XS paid orders:", xsOrders.length, "pending ERP:", pendingXs.length);
if (pendingXs.length) {
  console.table(pendingXs.map((o) => ({ tn: o.id, skus: o.skus.join(", ") })));
}
console.log("\nDryRun", TARGET_TN, "@", BASE);
console.log(JSON.stringify(dryRun, null, 2));
console.log("\nJSON:", out);

if (!dryRun.ok || dryRun.step === "build_items") {
  console.error("DryRun FAILED — deploy con XS requerido si BASE es prod");
  process.exit(dryRun.ok === false ? 1 : 0);
}
