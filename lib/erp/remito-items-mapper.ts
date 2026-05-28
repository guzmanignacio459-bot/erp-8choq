/**
 * Mapeo GAS getRemitoItemsFull → ErpRemitoItemRow.
 * Solo lectura — no recalcula netos.
 */

import { formatRemitoFechaDisplay } from "@/lib/erp/remitos-mapper";
import type { ErpRemitoItemOwner, ErpRemitoItemRow } from "@/types/erp";

function num(value: unknown): number {
  if (value == null || value === "") return 0;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const n = parseFloat(String(value).replace(/[^\d.,\-]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function numOrNull(value: unknown): number | null {
  const n = num(value);
  return n !== 0 ? n : null;
}

function str(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function normalizeOwner(value: unknown): ErpRemitoItemOwner {
  return str(value).toUpperCase() === "SCNL" ? "SCNL" : "8Q";
}

function pickNetoDisplay(netoReal: unknown, netoPrenda: unknown): number {
  const real = num(netoReal);
  if (real !== 0) return real;
  return num(netoPrenda);
}

export function mapGasRemitoItemRow(raw: unknown): ErpRemitoItemRow | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;

  const idRemito = str(row.idRemito ?? row["ID Remito"]);
  if (!idRemito) return null;

  const fechaRaw = str(row.fecha ?? row.Fecha);
  const cantidadRaw = num(row.cantidad ?? row.Cantidad);
  const cantidad = cantidadRaw > 0 ? cantidadRaw : 1;
  const netoPrenda = num(row.netoPrenda ?? row.NETO_PRENDA);
  const netoPrendaReal = numOrNull(row.netoPrendaReal ?? row.NETO_PRENDA_REAL);

  return {
    idRemito,
    fechaRaw,
    fechaDisplay: formatRemitoFechaDisplay(fechaRaw) || fechaRaw || "—",
    sku: str(row.sku ?? row.SKU),
    articulo: str(row.articulo ?? row.Articulo ?? row.Artículo),
    talle: str(row.talle ?? row.Talle),
    owner: normalizeOwner(row.owner ?? row.Owner),
    cantidad,
    precioUnitario: num(row.precioUnitario ?? row["Precio Unitario"]),
    descuentoAsignado: num(row.descuentoAsignado ?? row.DESCUENTO_ASIGNADO),
    shippingAsignado: num(row.shippingAsignado ?? row.SHIPPING_ASIGNADO),
    feeAsignado: num(row.feeAsignado ?? row.FEE_ASIGNADO),
    netoPrenda,
    netoPrendaReal,
    netoDisplay: pickNetoDisplay(netoPrendaReal, netoPrenda),
    mpFeeAsignadoReal: numOrNull(
      row.mpFeeAsignadoReal ?? row.MP_FEE_ASIGNADO_REAL
    ),
    mpPlatformFeeAsignadoReal: numOrNull(
      row.mpPlatformFeeAsignadoReal ?? row.MP_PLATFORM_FEE_ASIGNADO_REAL
    ),
    mpTotalCostAsignadoReal: numOrNull(
      row.mpTotalCostAsignadoReal ?? row.MP_TOTAL_COST_ASIGNADO_REAL
    ),
  };
}

export function mapGasRemitoItemsPayload(raw: unknown): ErpRemitoItemRow[] {
  if (!raw || typeof raw !== "object") return [];
  const payload = raw as Record<string, unknown>;
  const data =
    payload.data && typeof payload.data === "object"
      ? (payload.data as Record<string, unknown>)
      : payload;

  const itemsRaw = Array.isArray(data.items) ? data.items : [];
  return itemsRaw
    .map(mapGasRemitoItemRow)
    .filter((r): r is ErpRemitoItemRow => r !== null);
}

export function displayMpFeeReal(row: ErpRemitoItemRow): number {
  if (row.mpTotalCostAsignadoReal != null) return row.mpTotalCostAsignadoReal;
  return (row.mpFeeAsignadoReal ?? 0) + (row.mpPlatformFeeAsignadoReal ?? 0);
}
