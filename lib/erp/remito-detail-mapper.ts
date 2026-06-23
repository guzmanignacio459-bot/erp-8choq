/**
 * Mapeo getRemito (GAS getRemitoById) → ErpRemitoDetail.
 * Solo lectura — no recalcula montos, shipping ni MP.
 */

import {
  extractTnOrderId,
  fieldSlug,
  flattenRemitoRow,
  formatRemitoFechaDisplay,
  mapRowToErpRemito,
  normalizeIdRemito,
} from "@/lib/erp/remitos-mapper";
import type { ErpRemitoDetail, ErpRemitoDetailItem } from "@/types/erp";

function cleanCellValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object") return "";
  const s = String(value).trim();
  if (s === "" || s === "—" || s === "-") return "";
  return s;
}

function pickMpField(
  flat: Record<string, unknown>,
  candidates: string[]
): string {
  for (const key of candidates) {
    const cleaned = cleanCellValue(flat[key]);
    if (cleaned) return cleaned;
  }
  for (const [key, value] of Object.entries(flat)) {
    const cleaned = cleanCellValue(value);
    if (!cleaned) continue;
    const slug = fieldSlug(key);
    if (candidates.some((c) => fieldSlug(c) === slug)) return cleaned;
  }
  return "";
}

function mapDetailItems(raw: unknown): ErpRemitoDetailItem[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((row): ErpRemitoDetailItem | null => {
      if (!row || typeof row !== "object") return null;
      const it = row as Record<string, unknown>;
      return {
        sku: cleanCellValue(it.sku ?? it.SKU),
        articulo: cleanCellValue(it.articulo ?? it.Articulo ?? it["Artículo"]),
        talle: cleanCellValue(it.talle ?? it.Talle),
        cantidad: cleanCellValue(it.cantidad ?? it.Cantidad),
        precioUnitario: cleanCellValue(
          it.precioUnitario ?? it["Precio Unitario"]
        ),
      };
    })
    .filter((it): it is ErpRemitoDetailItem => it !== null);
}

function mergeFromGetRemitoNormalized(
  raw: Record<string, unknown>
): Record<string, unknown> {
  const flat: Record<string, unknown> = { ...raw };
  const totales = raw.totales;

  if (totales && typeof totales === "object" && !Array.isArray(totales)) {
    const t = totales as Record<string, unknown>;
    if (!cleanCellValue(flat["Total De Prendas"])) {
      flat["Total De Prendas"] = t.prendas ?? "";
    }
    if (!cleanCellValue(flat.Subtotal)) {
      flat.Subtotal = t.subtotal ?? "";
    }
    if (!cleanCellValue(flat["Shipping Customer Cost"])) {
      flat["Shipping Customer Cost"] =
        t.shippingCustomerCost ?? t.costoEnvio ?? "";
    }
    if (!cleanCellValue(flat["Envio Owner"])) {
      flat["Envio Owner"] = t.envioOwner ?? "";
    }
    if (!cleanCellValue(flat["Shipping Owner Cost"])) {
      flat["Shipping Owner Cost"] = t.shippingOwnerCost ?? "";
    }
    if (!cleanCellValue(flat["Total Final"])) {
      flat["Total Final"] = t.totalFinal ?? "";
    }
  }

  if (!cleanCellValue(flat["ID Remito"])) {
    flat["ID Remito"] = raw.id ?? raw.idRemito ?? "";
  }
  if (!cleanCellValue(flat.Nombre)) {
    flat.Nombre = raw.nombre ?? "";
  }
  if (!cleanCellValue(flat["Provincia/Localidad"])) {
    flat["Provincia/Localidad"] =
      raw.ubicacion ?? raw.localidad ?? raw.provinciaLocalidad ?? "";
  }
  if (!cleanCellValue(flat["Metodo De Pago"])) {
    flat["Metodo De Pago"] = raw.metodoPago ?? raw.metodoDePago ?? "";
  }
  if (!cleanCellValue(flat["Condicion Compra"])) {
    flat["Condicion Compra"] =
      raw.condicionCompra ?? raw["Condición Compra"] ?? "";
  }
  if (!cleanCellValue(flat["Detalle general"])) {
    flat["Detalle general"] = raw.detalleGeneral ?? "";
  }

  const mpKeys: [string, string][] = [
    ["mpPaymentId", "MP_PAYMENT_ID"],
    ["mpStatus", "MP_STATUS"],
    ["mpStatusDetail", "MP_STATUS_DETAIL"],
    ["mpPaymentType", "MP_PAYMENT_TYPE"],
    ["mpPaymentMethod", "MP_PAYMENT_METHOD"],
    ["mpInstallments", "MP_INSTALLMENTS"],
    ["mpTransactionAmount", "MP_TRANSACTION_AMOUNT"],
    ["mpNetReceivedAmount", "MP_NET_RECEIVED_AMOUNT"],
    ["mpTaxTotalReal", "MP_TAX_TOTAL_REAL"],
    ["mpFinancingTotalReal", "MP_FINANCING_TOTAL_REAL"],
    ["mpFeeTotalReal", "MP_FEE_TOTAL_REAL"],
    ["mpPlatformFeeTotalReal", "MP_PLATFORM_FEE_TOTAL_REAL"],
    ["mpTotalCostReal", "MP_TOTAL_COST_REAL"],
    ["mpNetoRealOrden", "MP_NETO_REAL_ORDEN"],
    ["mpCostPercentReal", "MP_COST_PERCENT_REAL"],
    ["mpDateApproved", "MP_DATE_APPROVED"],
    ["mpImportedAt", "MP_IMPORTED_AT"],
    ["mpPayerEmail", "MP_PAYER_EMAIL"],
  ];
  for (const [camel, sheet] of mpKeys) {
    const fromGas = cleanCellValue(raw[camel]);
    if (fromGas && !cleanCellValue(flat[sheet])) flat[sheet] = fromGas;
  }

  return flat;
}

function pickMpFromSource(
  source: Record<string, unknown>,
  flat: Record<string, unknown>,
  camelKey: string,
  sheetNames: string[]
): string {
  const fromSource = cleanCellValue(source[camelKey]);
  if (fromSource) return fromSource;
  return pickMpField(flat, sheetNames);
}

/** Mapea respuesta GAS getRemito → ErpRemitoDetail */
export function mapGetRemitoToErpDetail(raw: unknown): ErpRemitoDetail | null {
  if (!raw || typeof raw !== "object") return null;

  const source = raw as Record<string, unknown>;
  const merged = mergeFromGetRemitoNormalized(source);
  const flat = flattenRemitoRow(merged);

  const base = mapRowToErpRemito(flat);
  if (!base) {
    const idRaw = cleanCellValue(source.id ?? source.idRemito);
    if (!idRaw) return null;
  }

  const idRemito = normalizeIdRemito(
    base?.idRemito ??
      cleanCellValue(flat["ID Remito"] ?? source.id ?? source.idRemito)
  );
  if (!idRemito) return null;

  const fechaRaw =
    base?.fechaRaw ??
    cleanCellValue(flat.Fecha ?? source.fecha ?? source.fechaRaw);

  const remito: ErpRemitoDetail = {
    ...(base ?? {
      idRemito,
      fechaRaw,
      fechaDisplay: formatRemitoFechaDisplay(fechaRaw),
      nombre: cleanCellValue(source.nombre),
      dni: cleanCellValue(source.dni),
      provinciaLocalidad: cleanCellValue(
        source.ubicacion ?? source.localidad ?? source.provinciaLocalidad
      ),
      telefono: cleanCellValue(source.telefono),
      transporte: cleanCellValue(source.transporte),
      metodoDePago: cleanCellValue(source.metodoPago ?? source.metodoDePago),
      vendedor: cleanCellValue(source.vendedor),
      condicionCompra: cleanCellValue(source.condicionCompra),
      totalPrendas: "",
      subtotal: "",
      shippingCustomerCost: "",
      envioOwner: "",
      shippingOwnerCost: "",
      recargoDescuento: cleanCellValue(source.recargoDescuento),
      totalFinal: "",
      estado: cleanCellValue(source.estado),
      tnOrderId: extractTnOrderId(flat),
    }),
    idRemito,
    fechaRaw,
    fechaDisplay: formatRemitoFechaDisplay(fechaRaw),
    detalleGeneral: cleanCellValue(
      source.detalleGeneral ?? flat["Detalle general"]
    ),
    tnOrderId:
      base?.tnOrderId ||
      extractTnOrderId(flat) ||
      extractTnOrderId({ "Detalle general": source.detalleGeneral }),
    mpPaymentId: pickMpFromSource(source, flat, "mpPaymentId", [
      "MP_PAYMENT_ID",
      "mpPaymentId",
    ]),
    mpStatus: pickMpFromSource(source, flat, "mpStatus", [
      "MP_STATUS",
      "mpStatus",
    ]),
    mpStatusDetail: pickMpFromSource(source, flat, "mpStatusDetail", [
      "MP_STATUS_DETAIL",
      "mpStatusDetail",
    ]),
    mpPaymentType: pickMpFromSource(source, flat, "mpPaymentType", [
      "MP_PAYMENT_TYPE",
      "mpPaymentType",
    ]),
    mpPaymentMethod: pickMpFromSource(source, flat, "mpPaymentMethod", [
      "MP_PAYMENT_METHOD",
      "mpPaymentMethod",
    ]),
    mpInstallments: pickMpFromSource(source, flat, "mpInstallments", [
      "MP_INSTALLMENTS",
      "mpInstallments",
    ]),
    mpTransactionAmount: pickMpFromSource(
      source,
      flat,
      "mpTransactionAmount",
      ["MP_TRANSACTION_AMOUNT", "mpTransactionAmount"]
    ),
    mpNetReceivedAmount: pickMpFromSource(
      source,
      flat,
      "mpNetReceivedAmount",
      ["MP_NET_RECEIVED_AMOUNT", "mpNetReceivedAmount"]
    ),
    mpTaxTotalReal: pickMpFromSource(source, flat, "mpTaxTotalReal", [
      "MP_TAX_TOTAL_REAL",
      "mpTaxTotalReal",
    ]),
    mpFinancingTotalReal: pickMpFromSource(
      source,
      flat,
      "mpFinancingTotalReal",
      ["MP_FINANCING_TOTAL_REAL", "mpFinancingTotalReal"]
    ),
    mpFeeTotalReal: pickMpFromSource(source, flat, "mpFeeTotalReal", [
      "MP_FEE_TOTAL_REAL",
      "mpFeeTotalReal",
    ]),
    mpPlatformFeeTotalReal: pickMpFromSource(
      source,
      flat,
      "mpPlatformFeeTotalReal",
      ["MP_PLATFORM_FEE_TOTAL_REAL", "mpPlatformFeeTotalReal"]
    ),
    mpTotalCostReal: pickMpFromSource(source, flat, "mpTotalCostReal", [
      "MP_TOTAL_COST_REAL",
      "mpTotalCostReal",
    ]),
    mpNetoRealOrden: pickMpFromSource(source, flat, "mpNetoRealOrden", [
      "MP_NETO_REAL_ORDEN",
      "mpNetoRealOrden",
    ]),
    mpCostPercentReal: pickMpFromSource(source, flat, "mpCostPercentReal", [
      "MP_COST_PERCENT_REAL",
      "mpCostPercentReal",
    ]),
    mpDateApproved: pickMpFromSource(source, flat, "mpDateApproved", [
      "MP_DATE_APPROVED",
      "mpDateApproved",
    ]),
    mpImportedAt: pickMpFromSource(source, flat, "mpImportedAt", [
      "MP_IMPORTED_AT",
      "mpImportedAt",
    ]),
    mpPayerEmail: pickMpFromSource(source, flat, "mpPayerEmail", [
      "MP_PAYER_EMAIL",
      "mpPayerEmail",
    ]),
    items: mapDetailItems(source.items),
  };

  return remito;
}

export function hasMercadoPagoDetailData(remito: ErpRemitoDetail): boolean {
  return Boolean(remito.mpPaymentId?.trim() || remito.mpStatus?.trim());
}
