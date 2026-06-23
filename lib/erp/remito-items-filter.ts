/**
 * Filtros client-side REMITO_ITEMS (artículo, talle, búsqueda libre).
 */

import type { ErpRemitoItemRow } from "@/types/erp";

export type RemitoItemsClientFilters = {
  articulo?: string;
  talle?: string;
  q?: string;
};

function norm(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function filterRemitoItemsClient(
  items: ErpRemitoItemRow[],
  filters: RemitoItemsClientFilters
): ErpRemitoItemRow[] {
  const articulo = norm(filters.articulo ?? "");
  const talle = norm(filters.talle ?? "");
  const q = norm(filters.q ?? "");

  if (!articulo && !talle && !q) return items;

  return items.filter((row) => {
    if (articulo && !norm(row.articulo).includes(articulo)) return false;
    if (talle && !norm(row.talle).includes(talle)) return false;
    if (q) {
      const haystack = norm(
        [row.idRemito, row.sku, row.articulo, row.talle, row.owner].join(" ")
      );
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}
