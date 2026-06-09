#!/usr/bin/env node
/**
 * Sprint L0 — Backfill read-only GAS/Sheets → JSON (sin escritura DB).
 *
 * Uso:
 *   node scripts/l0-backfill-gas-to-json.mjs
 *   node scripts/l0-backfill-gas-to-json.mjs --out _wip/l0-backfill.json
 *   node scripts/l0-backfill-gas-to-json.mjs --skip-items
 *
 * Requiere: APPS_SCRIPT_URL (+ APPS_SCRIPT_TOKEN si aplica) en .env.local
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";

import {
  fetchListRemitosFull,
  fetchRemitoItemsFull,
} from "./lib/l0-gas-client.mjs";
import {
  cleanCell,
  customerExternalKey,
  extractTnOrderId,
  normalizeIdRemito,
  parseAmount,
  pickField,
} from "./lib/l0-parse.mjs";

function parseArgs() {
  let out =
    process.env.L0_BACKFILL_OUT ??
    path.join("_wip", `l0-backfill-${new Date().toISOString().slice(0, 10)}.json`);
  let skipItems = false;
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === "--out" && process.argv[i + 1]) {
      out = process.argv[++i];
      continue;
    }
    if (process.argv[i] === "--skip-items") skipItems = true;
  }
  return { out, skipItems };
}

function mapGasRowToOrder(row) {
  const flat = { ...row };
  const idRaw = pickField(flat, [
    "ID Remito",
    "ID remito",
    "idRemito",
    "id",
  ]);
  const id = normalizeIdRemito(idRaw);
  if (!id) return null;

  const fechaRaw = pickField(flat, ["Fecha", "fecha", "fechaISO"]);
  const nombre = pickField(flat, ["Nombre", "nombre"]);
  const dni = pickField(flat, ["DNI", "dni"]);
  const telefono = pickField(flat, ["Telefono", "Teléfono", "telefono"]);
  const provinciaLocalidad = pickField(flat, [
    "Provincia/Localidad",
    "Provincia / Localidad",
    "provinciaLocalidad",
  ]);

  const customerKey = customerExternalKey({ dni, nombre, telefono });

  const order = {
    id,
    fecha: fechaRaw || null,
    customerKey,
    nombre: nombre || "—",
    dni: dni || null,
    provinciaLocalidad: provinciaLocalidad || null,
    telefono: telefono || null,
    transporte: pickField(flat, ["Transporte", "transporte"]) || null,
    metodoPago:
      pickField(flat, ["Metodo De Pago", "Método De Pago", "metodoPago"]) ||
      null,
    vendedor: pickField(flat, ["Vendedor", "vendedor"]) || null,
    condicionCompra:
      pickField(flat, ["Condicion Compra", "Condición Compra"]) || null,
    estado: pickField(flat, ["Estado", "estado"]) || null,
    totalPrendas: Math.round(
      parseAmount(pickField(flat, ["Total De Prendas", "totalPrendas"]))
    ),
    subtotal: parseAmount(pickField(flat, ["Subtotal", "subtotal"])),
    shippingCustomerCost: parseAmount(
      pickField(flat, ["Shipping Customer Cost", "shippingCustomerCost"])
    ),
    envioOwner: pickField(flat, ["Envio Owner", "Envío Owner"]) || null,
    shippingOwnerCost: parseAmount(
      pickField(flat, ["Shipping Owner Cost", "shippingOwnerCost"])
    ),
    recargoDescuento: parseAmount(
      pickField(flat, ["Recargo/Descuento", "recargoDescuento"])
    ),
    totalFinal: parseAmount(pickField(flat, ["Total Final", "totalFinal"])),
    detalleGeneral:
      pickField(flat, ["Detalle general", "Detalle General"]) || null,
    tnOrderId: extractTnOrderId(flat) || null,
    scnlItems: pickField(flat, ["SCNL_Items", "SCNL Items"]) || null,
    duenoScnlMonto: parseAmount(
      pickField(flat, ["Dueño SCNL Monto", "Dueno SCNL Monto"])
    ),
    source: "gas_backfill",
    sheetRowHash: crypto
      .createHash("sha256")
      .update(JSON.stringify(flat))
      .digest("hex")
      .slice(0, 16),
  };

  const mpPaymentId = pickField(flat, ["MP_PAYMENT_ID", "mpPaymentId"]);
  const payment =
    mpPaymentId || pickField(flat, ["MP_STATUS", "mpStatus"])
      ? {
          orderId: id,
          mpPaymentId: mpPaymentId || null,
          mpAdditionalReference:
            pickField(flat, ["MP_ADDITIONAL_REFERENCE"]) || null,
          mpMatchConfidence:
            pickField(flat, ["MP_MATCH_CONFIDENCE"]) || null,
          mpMatchRule: pickField(flat, ["MP_MATCH_RULE"]) || null,
          mpStatus: pickField(flat, ["MP_STATUS", "mpStatus"]) || null,
          mpStatusDetail: pickField(flat, ["MP_STATUS_DETAIL"]) || null,
          mpTransactionAmount: parseAmount(
            pickField(flat, ["MP_TRANSACTION_AMOUNT"])
          ),
          mpNetReceivedAmount: parseAmount(
            pickField(flat, ["MP_NET_RECEIVED_AMOUNT"])
          ),
          mpNetoRealOrden: parseAmount(
            pickField(flat, ["MP_NETO_REAL_ORDEN", "mpNetoRealOrden"])
          ),
          mpFeeTotalReal: parseAmount(
            pickField(flat, ["MP_FEE_TOTAL_REAL", "mpFeeTotalReal"])
          ),
          mpPlatformFeeTotalReal: parseAmount(
            pickField(flat, ["MP_PLATFORM_FEE_TOTAL_REAL"])
          ),
          mpTotalCostReal: parseAmount(
            pickField(flat, ["MP_TOTAL_COST_REAL", "mpTotalCostReal"])
          ),
          mpPayerEmail: pickField(flat, ["MP_PAYER_EMAIL"]) || null,
          mpPaymentType: pickField(flat, ["MP_PAYMENT_TYPE"]) || null,
          mpPaymentMethod: pickField(flat, ["MP_PAYMENT_METHOD"]) || null,
          source: "gas_backfill",
        }
      : null;

  return { order, payment };
}

function mapGasItemRow(raw) {
  if (!raw || typeof raw !== "object") return null;
  const row = raw;
  const orderId = normalizeIdRemito(
    cleanCell(row.idRemito ?? row["ID Remito"])
  );
  if (!orderId) return null;

  return {
    orderId,
    fecha: cleanCell(row.fecha ?? row.Fecha) || null,
    sku: cleanCell(row.sku ?? row.SKU) || "—",
    articulo: cleanCell(row.articulo ?? row.Articulo) || null,
    talle: cleanCell(row.talle ?? row.Talle) || null,
    cantidad: Math.max(1, Math.round(parseAmount(row.cantidad ?? row.Cantidad))),
    precioUnitario: parseAmount(row.precioUnitario ?? row["Precio Unitario"]),
    owner: cleanCell(row.owner ?? row.Owner) || null,
    metodoPago: cleanCell(row.metodoPago ?? row["Metodo De Pago"]) || null,
    descuentoAsignado: parseAmount(
      row.descuentoAsignado ?? row.DESCUENTO_ASIGNADO
    ),
    shippingAsignado: parseAmount(
      row.shippingAsignado ?? row.SHIPPING_ASIGNADO
    ),
    feeAsignado: parseAmount(row.feeAsignado ?? row.FEE_ASIGNADO),
    netoPrenda: parseAmount(row.netoPrenda ?? row.NETO_PRENDA),
    netoPrendaReal: parseAmount(row.netoPrendaReal ?? row.NETO_PRENDA_REAL) || null,
    mpFeeAsignadoReal:
      parseAmount(row.mpFeeAsignadoReal ?? row.MP_FEE_ASIGNADO_REAL) || null,
    source: "gas_backfill",
  };
}

function buildCustomers(orders) {
  const map = new Map();
  for (const o of orders) {
    if (!o.customerKey || map.has(o.customerKey)) continue;
    map.set(o.customerKey, {
      externalKey: o.customerKey,
      nombre: o.nombre,
      dni: o.dni,
      provinciaLocalidad: o.provinciaLocalidad,
      telefono: o.telefono,
    });
  }
  return [...map.values()];
}

async function main() {
  const { out, skipItems } = parseArgs();
  const started = Date.now();

  console.log("[L0 backfill] Fetching listRemitosFull…");
  const { rows, action } = await fetchListRemitosFull();
  console.log(`[L0 backfill] GAS action=${action} rows=${rows.length}`);

  const orders = [];
  const payments = [];
  for (const row of rows) {
    const mapped = mapGasRowToOrder(row);
    if (!mapped) continue;
    orders.push(mapped.order);
    if (mapped.payment) payments.push(mapped.payment);
  }

  let orderItems = [];
  let itemsSummary = null;
  if (!skipItems) {
    console.log("[L0 backfill] Fetching getRemitoItemsFull…");
    const itemsResult = await fetchRemitoItemsFull();
    orderItems = itemsResult.items
      .map(mapGasItemRow)
      .filter(Boolean);
    itemsSummary = itemsResult.summary;
    console.log(`[L0 backfill] items=${orderItems.length}`);
  }

  const customers = buildCustomers(orders);

  const payload = {
    generatedAt: new Date().toISOString(),
    phase: "L0",
    readOnly: true,
    source: "gas",
    schemaVersion: "v2-tn-erp-split",
    gasAction: action,
    elapsedMs: Date.now() - started,
    counts: {
      erpOrders: orders.length,
      erpOrderItems: orderItems.length,
      customers: customers.length,
      payments: payments.length,
      tnOrders: 0,
    },
    itemsSummary,
    customers,
    /** Capa B — procesamiento ERP (GAS REMITOS) */
    erpOrders: orders,
    erpOrderItems: orderItems,
    /** Capa A — vacía en L0; L1 sync TN API */
    tnOrders: [],
    tnOrderItems: [],
    payments,
    importLogs: [],
    /** @deprecated alias L0 — usar erpOrders */
    orders,
    orderItems,
  };

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(payload, null, 2));
  console.log(`[L0 backfill] Wrote ${out}`);
  console.log(JSON.stringify(payload.counts));
}

main().catch((err) => {
  console.error("[L0 backfill] FAIL:", err.message);
  process.exit(1);
});
