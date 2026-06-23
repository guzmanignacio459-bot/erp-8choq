/**
 * L1 — Mapeo GAS REMITOS/ITEMS → capa B (erp_orders)
 */

import crypto from "crypto";

import {
  cleanCell,
  customerExternalKey,
  extractTnOrderId,
  normalizeIdRemito,
  parseAmount,
  pickField,
} from "./l0-parse.mjs";
import { inArtRange } from "./l0-art-date.mjs";

export function mapGasRowToErpOrder(row) {
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
  const tnOrderId = extractTnOrderId(flat) || null;

  const totalFinalErp = parseAmount(
    pickField(flat, ["Total Final", "totalFinal"])
  );
  const mpNeto = parseAmount(
    pickField(flat, ["MP_NETO_REAL_ORDEN", "mpNetoRealOrden"])
  );

  const order = {
    id,
    tnOrderId,
    fecha: fechaRaw || null,
    fechaErp: fechaRaw || null,
    customerKey: customerExternalKey({ dni, nombre, telefono }),
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
    subtotalErp: parseAmount(pickField(flat, ["Subtotal", "subtotal"])),
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
    totalFinalErp,
    totalFinal: totalFinalErp,
    netoOperativo: mpNeto > 0 ? mpNeto : null,
    detalleGeneral:
      pickField(flat, ["Detalle general", "Detalle General"]) || null,
    scnlItems: pickField(flat, ["SCNL_Items", "SCNL Items"]) || null,
    duenoScnlMonto: parseAmount(
      pickField(flat, ["Dueño SCNL Monto", "Dueno SCNL Monto"])
    ) || null,
    processingStatus: tnOrderId ? "imported" : "manual_no_tn",
    source: "l1_gas_backfill",
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
          erpOrderId: id,
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
          mpNetoRealOrden: mpNeto || null,
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
          source: "l1_gas_backfill",
        }
      : null;

  return { order, payment };
}

export function mapGasItemToErpOrderItem(raw) {
  if (!raw || typeof raw !== "object") return null;
  const erpOrderId = normalizeIdRemito(
    cleanCell(raw.idRemito ?? raw["ID Remito"])
  );
  if (!erpOrderId) return null;

  return {
    erpOrderId,
    fechaErp: cleanCell(raw.fecha ?? raw.Fecha) || null,
    sku: cleanCell(raw.sku ?? raw.SKU) || "—",
    articulo: cleanCell(raw.articulo ?? raw.Articulo) || null,
    talle: cleanCell(raw.talle ?? raw.Talle) || null,
    cantidad: Math.max(1, Math.round(parseAmount(raw.cantidad ?? raw.Cantidad))),
    precioUnitario: parseAmount(raw.precioUnitario ?? raw["Precio Unitario"]),
    owner: cleanCell(raw.owner ?? raw.Owner) || null,
    metodoPago: cleanCell(raw.metodoPago ?? raw["Metodo De Pago"]) || null,
    descuentoAsignado: parseAmount(
      raw.descuentoAsignado ?? raw.DESCUENTO_ASIGNADO
    ),
    shippingAsignado: parseAmount(
      raw.shippingAsignado ?? raw.SHIPPING_ASIGNADO
    ),
    feeAsignado: parseAmount(raw.feeAsignado ?? raw.FEE_ASIGNADO),
    netoPrenda: parseAmount(raw.netoPrenda ?? raw.NETO_PRENDA),
    netoPrendaReal:
      parseAmount(raw.netoPrendaReal ?? raw.NETO_PRENDA_REAL) || null,
    mpFeeAsignadoReal:
      parseAmount(raw.mpFeeAsignadoReal ?? raw.MP_FEE_ASIGNADO_REAL) || null,
    source: "l1_gas_backfill",
  };
}

export function erpInPeriodKpi(order, fromYmd, toYmd) {
  return inArtRange(order.fechaErp ?? order.fecha, fromYmd, toYmd);
}

export function sumErpKpi(orders, fromYmd, toYmd) {
  const rows = orders.filter((o) => erpInPeriodKpi(o, fromYmd, toYmd));
  return {
    remitos: rows.length,
    facturacion: rows.reduce((s, r) => s + r.totalFinalErp, 0),
    netoOperativo: rows.reduce(
      (s, r) => s + (r.netoOperativo ?? 0),
      0
    ),
    ids: rows.map((r) => r.id),
    tnIds: rows.map((r) => r.tnOrderId).filter(Boolean),
  };
}

export function buildCustomerRecords(erpOrders) {
  const map = new Map();
  for (const o of erpOrders) {
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
