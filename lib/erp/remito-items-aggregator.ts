/**
 * Agregaciones REMITO_ITEMS — solo sumas/groupBy sobre columnas existentes.
 */

import { displayMpFeeReal } from "@/lib/erp/remito-items-mapper";
import type {
  ErpRemitoItemOwner,
  ErpRemitoItemRow,
  ErpRemitoItemsProductAnalytics,
  ErpRemitoItemsSummary,
} from "@/types/erp";

const TOP_N = 10;

function units(row: ErpRemitoItemRow): number {
  return row.cantidad > 0 ? row.cantidad : 1;
}

export function computeRemitoItemsSummary(
  items: ErpRemitoItemRow[]
): ErpRemitoItemsSummary {
  let totalBrutoPrendas = 0;
  let totalPrendas = 0;
  let netoTotalPrendas = 0;
  let descuentoTotal = 0;
  let shippingTotal = 0;
  let feeTotal = 0;
  let mpFeeAsignadoRealTotal = 0;
  let unidadesScnl = 0;
  let unidades8q = 0;

  for (const row of items) {
    const u = units(row);
    totalBrutoPrendas += row.precioUnitario * u;
    totalPrendas += u;
    netoTotalPrendas += row.netoDisplay * u;
    descuentoTotal += row.descuentoAsignado * u;
    shippingTotal += row.shippingAsignado * u;
    feeTotal += row.feeAsignado * u;
    mpFeeAsignadoRealTotal += displayMpFeeReal(row) * u;
    if (row.owner === "SCNL") unidadesScnl += u;
    else unidades8q += u;
  }

  return {
    totalBrutoPrendas,
    totalPrendas,
    netoTotalPrendas,
    descuentoTotal,
    shippingTotal,
    feeTotal,
    mpFeeAsignadoRealTotal,
    unidadesScnl,
    unidades8q,
    rowsInScope: items.length,
  };
}

function topFromMap<T extends { unidades: number }>(
  map: Map<string, T>,
  limit = TOP_N
): T[] {
  return Array.from(map.values())
    .sort((a, b) => b.unidades - a.unidades)
    .slice(0, limit);
}

function topNetoFromMap<T extends { neto: number }>(
  map: Map<string, T>,
  limit = TOP_N
): T[] {
  return Array.from(map.values())
    .sort((a, b) => b.neto - a.neto)
    .slice(0, limit);
}

export function computeRemitoItemsProductAnalytics(
  items: ErpRemitoItemRow[]
): ErpRemitoItemsProductAnalytics {
  const skuMap = new Map<string, { sku: string; articulo: string; unidades: number; neto: number }>();
  const articuloMap = new Map<string, { articulo: string; unidades: number; neto: number }>();
  const talleMap = new Map<string, { talle: string; unidades: number }>();
  const ownerMap = new Map<ErpRemitoItemOwner, { owner: ErpRemitoItemOwner; unidades: number; neto: number }>();
  const productMap = new Map<string, { sku: string; articulo: string; unidades: number; neto: number }>();

  for (const row of items) {
    const u = units(row);
    const neto = row.netoDisplay * u;
    const skuKey = row.sku || "—";
    const artKey = row.articulo || "—";
    const talleKey = row.talle || "—";
    const productKey = `${skuKey}|${artKey}`;

    const skuEntry = skuMap.get(skuKey) ?? {
      sku: skuKey,
      articulo: row.articulo,
      unidades: 0,
      neto: 0,
    };
    skuEntry.unidades += u;
    skuEntry.neto += neto;
    skuMap.set(skuKey, skuEntry);

    const artEntry = articuloMap.get(artKey) ?? {
      articulo: artKey,
      unidades: 0,
      neto: 0,
    };
    artEntry.unidades += u;
    artEntry.neto += neto;
    articuloMap.set(artKey, artEntry);

    const talleEntry = talleMap.get(talleKey) ?? {
      talle: talleKey,
      unidades: 0,
    };
    talleEntry.unidades += u;
    talleMap.set(talleKey, talleEntry);

    const ownerEntry = ownerMap.get(row.owner) ?? {
      owner: row.owner,
      unidades: 0,
      neto: 0,
    };
    ownerEntry.unidades += u;
    ownerEntry.neto += neto;
    ownerMap.set(row.owner, ownerEntry);

    const productEntry = productMap.get(productKey) ?? {
      sku: skuKey,
      articulo: artKey,
      unidades: 0,
      neto: 0,
    };
    productEntry.unidades += u;
    productEntry.neto += neto;
    productMap.set(productKey, productEntry);
  }

  return {
    topSku: topFromMap(skuMap),
    topArticulo: topFromMap(articuloMap).map(({ articulo, unidades, neto }) => ({
      articulo,
      unidades,
      neto,
    })),
    ventasPorTalle: topFromMap(talleMap).map(({ talle, unidades }) => ({
      talle,
      unidades,
    })),
    netoPorOwner: Array.from(ownerMap.values()).sort(
      (a, b) => b.neto - a.neto
    ),
    netoPorProducto: topNetoFromMap(productMap),
  };
}
