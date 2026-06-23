import type { ErpRemito } from "@/types/erp";

function normalizeFilterValue(value: string): string {
  return value.trim();
}

export function filterRemitosByEstado(
  remitos: ErpRemito[],
  estado: string | null
): ErpRemito[] {
  const target = estado?.trim();
  if (!target || target === "all") return remitos;
  return remitos.filter(
    (r) => normalizeFilterValue(r.estado).toLowerCase() === target.toLowerCase()
  );
}

export function filterRemitosByMetodoPago(
  remitos: ErpRemito[],
  metodo: string | null
): ErpRemito[] {
  const target = metodo?.trim();
  if (!target || target === "all") return remitos;
  return remitos.filter(
    (r) =>
      normalizeFilterValue(r.metodoDePago).toLowerCase() === target.toLowerCase()
  );
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b, "es")
  );
}

export function extractUniqueEstados(remitos: ErpRemito[]): string[] {
  return uniqueSorted(remitos.map((r) => r.estado));
}

export function extractUniqueMetodosPago(remitos: ErpRemito[]): string[] {
  return uniqueSorted(remitos.map((r) => r.metodoDePago));
}
