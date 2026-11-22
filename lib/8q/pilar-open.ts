/** Lectura del 2026-11-19. Estos meses no están en la copia y no se suman. */
export const OPEN_PERIODS = {
  readAt: "2026-11-19",
  octubre: {
    mes: "2026-10",
    desde: "2026-10-01",
    hasta: "2026-10-31",
    ordenes: 192,
    pagadas: 181,
    mercadoPagoPagadas: 132,
    transferenciasPagadas: 49,
    transferenciasPendientes: 7,
    unidadesSinRemito: 655,
    remitos: 0,
    prendas: 0,
  },
  noviembre: {
    mes: "2026-11",
    desde: "2026-11-01",
    hasta: "2026-11-19",
    ordenes: 129,
    pagadas: 121,
    mercadoPagoPagadas: 95,
    transferenciasPagadas: 26,
    transferenciasPendientes: 7,
    unidadesSinRemito: 381,
    remitos: 0,
    prendas: 0,
  },
} as const;

export type OpenCoverage = "cerrado" | "parcial" | "abierto";

export function openCoverage(from: string, to: string): OpenCoverage {
  if (to < "2026-10-01") return "cerrado";
  if (from >= "2026-10-01") return "abierto";
  return "parcial";
}
