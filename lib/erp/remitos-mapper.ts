/**
 * Normalización de filas REMITOS (sheet raw + GAS normalizado).
 * Solo lectura — no recalcula montos ni netos.
 */

import { parseRemitoFecha } from "@/lib/erp/remitos-date";
import type { ErpRemito } from "@/types/erp";

/** Slug de header: sin acentos, solo alfanumérico */
export function fieldSlug(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function cleanCellValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object") return "";
  const s = String(value).trim();
  if (s === "" || s === "—" || s === "-") return "";
  return s;
}

/** Aplana cliente / envio / pago anidados sin perder columnas de sheet */
export function flattenRemitoRow(row: Record<string, unknown>): Record<string, unknown> {
  const flat: Record<string, unknown> = { ...row };

  const cliente = row.cliente;
  if (cliente && typeof cliente === "object" && !Array.isArray(cliente)) {
    const c = cliente as Record<string, unknown>;
    if (!cleanCellValue(flat.Nombre) && !cleanCellValue(flat.nombre)) {
      flat.nombre = c.nombre ?? c.Nombre ?? "";
    }
    if (!cleanCellValue(flat.Localidad) && !cleanCellValue(flat.localidad)) {
      flat.localidad = c.localidad ?? c.Localidad ?? "";
    }
    if (!cleanCellValue(flat.Provincia) && !cleanCellValue(flat.provincia)) {
      flat.provincia = c.provincia ?? c.Provincia ?? "";
    }
    const provLoc =
      c.provinciaLocalidad ??
      c["Provincia/Localidad"] ??
      [c.provincia, c.localidad].filter(Boolean).join(" / ");
    if (provLoc && !cleanCellValue(flat["Provincia/Localidad"])) {
      flat["Provincia/Localidad"] = provLoc;
    }
  }

  const envio = row.envio;
  if (envio && typeof envio === "object" && !Array.isArray(envio)) {
    const e = envio as Record<string, unknown>;
    if (!cleanCellValue(flat.Transporte) && !cleanCellValue(flat.transporte)) {
      flat.transporte = e.metodo ?? e.Transporte ?? e.transporte ?? "";
    }
  }

  const pago = row.pago;
  if (pago && typeof pago === "object" && !Array.isArray(pago)) {
    const p = pago as Record<string, unknown>;
    if (!cleanCellValue(flat["Metodo De Pago"]) && !cleanCellValue(flat.metodoPago)) {
      flat.metodoPago = p.metodo ?? p.metodoPago ?? "";
    }
  }

  return flat;
}

const SLUG_ALIASES: Record<string, string[]> = {
  idremito: ["idremito", "id", "remitoid"],
  fecha: ["fecha", "fechaiso", "date"],
  nombre: ["nombre", "cliente", "name"],
  dni: ["dni", "documento", "nrodocumento"],
  telefono: ["telefono", "tel", "phone", "celular"],
  provincialocalidad: [
    "provincialocalidad",
    "provincia",
    "localidad",
    "ubicacion",
    "provincialocalizacion",
  ],
  transporte: ["transporte", "shipping", "envio"],
  metododepago: [
    "metododepago",
    "metodopago",
    "paymentmethod",
    "metodopayment",
    "pago",
  ],
  condicioncompra: ["condicioncompra", "condicion", "condiciondecompra"],
  subtotal: ["subtotal", "subtotalprendas"],
  shippingcustomercost: ["shippingcustomercost", "shippingpaid"],
  shippingownercost: ["shippingownercost"],
  envioowner: ["envioowner"],
  recargodescuento: ["recargodescuento", "recargo", "descuento"],
  totalfinal: ["totalfinal", "total", "totalfinalars"],
  estado: ["estado", "status"],
  detallegeneral: ["detallegeneral", "detalle"],
  tnorderid: ["tnorderid", "tnorder", "orderid"],
  mppaymentid: ["mppaymentid", "mppayment"],
  mptotalcostreal: ["mptotalcostreal"],
  mpnetorealorden: ["mpnetorealorden", "mpnetoreal"],
  vendedor: ["vendedor", "seller"],
  totalprendas: ["totalprendas", "totalprenda", "prendas"],
  mpstatus: ["mpstatus", "estadomp"],
};

function pickBySlug(
  row: Record<string, unknown>,
  targetSlug: keyof typeof SLUG_ALIASES
): string {
  const aliases = new Set(SLUG_ALIASES[targetSlug] ?? [targetSlug]);

  for (const [key, value] of Object.entries(row)) {
    const slug = fieldSlug(key);
    if (aliases.has(slug)) {
      const cleaned = cleanCellValue(value);
      if (cleaned) return cleaned;
    }
  }

  return "";
}

function pickField(
  row: Record<string, unknown>,
  candidates: string[],
  slug?: keyof typeof SLUG_ALIASES
): string {
  for (const key of candidates) {
    const cleaned = cleanCellValue(row[key]);
    if (cleaned) return cleaned;
  }

  const normalized = candidates.map((c) => fieldSlug(c));
  for (const [key, value] of Object.entries(row)) {
    const cleaned = cleanCellValue(value);
    if (!cleaned) continue;
    if (normalized.includes(fieldSlug(key))) return cleaned;
  }

  if (slug) return pickBySlug(row, slug);
  return "";
}

export function normalizeIdRemito(id: string): string {
  return id
    .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, "-")
    .replace(/\s+/g, "")
    .trim();
}

/** DD/MM/YYYY HH:mm (es-AR) — solo presentación */
export function formatRemitoFechaDisplay(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  const d = parseRemitoFecha(trimmed) ?? (() => {
    const t = Date.parse(trimmed);
    return Number.isNaN(t) ? null : new Date(t);
  })();

  if (!d || Number.isNaN(d.getTime())) return trimmed;

  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");

  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

function buildProvinciaLocalidad(row: Record<string, unknown>): string {
  const combined = pickField(
    row,
    [
      "Provincia/Localidad",
      "Provincia / Localidad",
      "provinciaLocalidad",
      "Provincia-Localidad",
      "Ubicacion",
      "Ubicación",
      "ubicacion",
    ],
    "provincialocalidad"
  );
  if (combined) return combined;

  const prov = pickField(row, ["Provincia", "provincia"], "provincia");
  const loc = pickField(row, ["Localidad", "localidad"], "localidad");
  return [prov, loc].filter(Boolean).join(" / ");
}

export function extractTnOrderId(row: Record<string, unknown>): string {
  const direct = pickField(
    row,
    ["TN_ORDER_ID", "TN Order ID", "tn_order_id", "tnOrderId"],
    "tnorderid"
  );
  if (direct) return direct;

  const detalle = pickField(
    row,
    [
      "Detalle general",
      "Detalle General",
      "detalleGeneral",
      "detalle_general",
    ],
    "detallegeneral"
  );
  const match = detalle.match(/TN_ORDER_ID\s*=\s*(\d+)/i);
  return match?.[1]?.trim() ?? "";
}

/** Mapea fila GAS (sheet o normalizada) → ErpRemito */
export function mapRowToErpRemito(row: unknown): ErpRemito | null {
  if (!row || typeof row !== "object") return null;

  const flat = flattenRemitoRow(row as Record<string, unknown>);

  const idRaw = pickField(
    flat,
    [
      "ID Remito",
      "ID remito",
      "Id Remito",
      "ID",
      "id",
      "idRemito",
      "remitoId",
    ],
    "idremito"
  );

  const idRemito = normalizeIdRemito(idRaw);
  if (!idRemito) return null;

  const fechaRaw = pickField(
    flat,
    ["Fecha", "fecha", "fechaISO", "date"],
    "fecha"
  );

  const metodoDePago = pickField(
    flat,
    [
      "Método De Pago",
      "Método Pago",
      "Metodo De Pago",
      "Metodo Pago",
      "Metodo de Pago",
      "Método de Pago",
      "metodoPago",
      "metodoDePago",
      "paymentMethod",
      "payment_method",
    ],
    "metododepago"
  );

  return {
    idRemito,
    fechaRaw,
    fechaDisplay: formatRemitoFechaDisplay(fechaRaw),
    nombre: pickField(flat, ["Nombre", "nombre", "cliente", "Cliente"], "nombre"),
    dni: pickField(flat, ["DNI", "dni", "Documento", "documento"], "dni"),
    provinciaLocalidad: buildProvinciaLocalidad(flat),
    telefono: pickField(
      flat,
      ["Teléfono", "Telefono", "telefono", "Tel", "Celular"],
      "telefono"
    ),
    transporte: pickField(
      flat,
      ["Transporte", "transporte", "shipping", "envio"],
      "transporte"
    ),
    metodoDePago,
    vendedor: pickField(flat, ["Vendedor", "vendedor"], "vendedor"),
    condicionCompra: pickField(
      flat,
      [
        "Condición Compra",
        "Condicion Compra",
        "Condición de Compra",
        "Condicion de Compra",
        "condicionCompra",
      ],
      "condicioncompra"
    ),
    totalPrendas: pickField(
      flat,
      ["Total De Prendas", "Total de Prendas", "totalPrendas", "total_prendas"],
      "totalprendas"
    ),
    subtotal: pickField(flat, ["Subtotal", "subtotal"], "subtotal"),
    shippingCustomerCost: pickField(
      flat,
      [
        "Shipping Customer Cost",
        "Shipping customer cost",
        "shippingCustomerCost",
        "shippingPaid",
      ],
      "shippingcustomercost"
    ),
    envioOwner: pickField(
      flat,
      ["Envío Owner", "Envio Owner", "envioOwner"],
      "envioowner"
    ),
    shippingOwnerCost: pickField(
      flat,
      [
        "Shipping Owner Cost",
        "Shipping owner cost",
        "shippingOwnerCost",
      ],
      "shippingownercost"
    ),
    recargoDescuento: pickField(
      flat,
      [
        "Recargo/Descuento",
        "Recargo / Descuento",
        "RecargoDescuento",
        "recargoDescuento",
      ],
      "recargodescuento"
    ),
    totalFinal: pickField(
      flat,
      ["Total Final", "Total final", "totalFinal", "total"],
      "totalfinal"
    ),
    estado: pickField(flat, ["Estado", "estado", "status"], "estado"),
    tnOrderId: extractTnOrderId(flat),
    mpPaymentId: pickField(
      flat,
      ["MP_PAYMENT_ID", "MP Payment ID", "mpPaymentId"],
      "mppaymentid"
    ),
    mpTotalCostReal: pickField(
      flat,
      ["MP_TOTAL_COST_REAL", "MP Total Cost Real", "mpTotalCostReal"],
      "mptotalcostreal"
    ),
    mpNetoRealOrden: pickField(
      flat,
      [
        "MP_NETO_REAL_ORDEN",
        "MP Neto Real Orden",
        "mpNetoRealOrden",
        "MP_NETO_REAL",
      ],
      "mpnetorealorden"
    ),
    mpStatus: pickField(
      flat,
      ["MP_STATUS", "MP Status", "mpStatus", "Estado MP"],
      "mpstatus"
    ),
    mpFeeTotalReal: pickField(
      flat,
      ["MP_FEE_TOTAL_REAL", "MP Fee Total Real", "mpFeeTotalReal"],
      "mpfeetotalreal"
    ),
    mpPlatformFeeTotalReal: pickField(
      flat,
      [
        "MP_PLATFORM_FEE_TOTAL_REAL",
        "MP Platform Fee Total Real",
        "mpPlatformFeeTotalReal",
      ],
      "mpplatformfeetotalreal"
    ),
    mpTransactionAmount: pickField(
      flat,
      [
        "MP_TRANSACTION_AMOUNT",
        "MP Transaction Amount",
        "mpTransactionAmount",
      ],
      "mptransactionamount"
    ),
  };
}
