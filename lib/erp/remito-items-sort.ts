/**
 * Orden REMITO_ITEMS por fecha — read-only, solo presentación.
 */

import { parseRemitoFecha } from "@/lib/erp/remitos-date";
import type { ErpRemitoItemRow } from "@/types/erp";

function fechaSortKey(fechaRaw: string): number {
  const d = parseRemitoFecha(fechaRaw);
  return d && !Number.isNaN(d.getTime()) ? d.getTime() : Number.NEGATIVE_INFINITY;
}

/** Más reciente primero; fechas inválidas al final */
export function sortRemitoItemsByFechaDesc(
  items: ErpRemitoItemRow[]
): ErpRemitoItemRow[] {
  return [...items].sort((a, b) => {
    const tb = fechaSortKey(b.fechaRaw);
    const ta = fechaSortKey(a.fechaRaw);
    if (tb !== ta) return tb - ta;
    return a.rowId.localeCompare(b.rowId);
  });
}
