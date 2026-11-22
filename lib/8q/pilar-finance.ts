/** Lote importado el 2026-11-19 13:22. Los importes salen de PILAR, no se recalculan. */
export const PILAR_FROM = "2026-08-01";
export const PILAR_TO = "2026-09-30";

export const PILAR_CONTROLS = {
  agosto: { remitos: 295, prendas: 903, ventas: "33933430.69" },
  septiembre: { remitos: 189, prendas: 653, ventas: "25125589.74" },
  total: { remitos: 484, prendas: 1556, ventas: "59059020.43" },
} as const;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function cents(value: string | number | null | undefined): number {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 100);
}

export function resolvePilarPeriod(input: {
  from?: string;
  to?: string;
  medio?: string;
}):
  | { ok: true; from: string; to: string; medio: string }
  | { ok: false; reason: string; from: string; to: string; medio: string } {
  const from = (input.from ?? "").trim() || PILAR_FROM;
  const to = (input.to ?? "").trim() || PILAR_TO;
  const medio = (input.medio ?? "").trim().slice(0, 80);
  if (!DAY.test(from) || !DAY.test(to) || from > to) {
    return { ok: false, reason: "El período no es un rango válido de fechas.", from, to, medio };
  }
  return { ok: true, from, to, medio };
}

export function monthControl(
  mes: string,
  remitos: number,
  prendas: number,
  ventas: string | number
): "coincide" | "distinto" | "fuera" {
  const expected = mes === "2026-08" ? PILAR_CONTROLS.agosto : mes === "2026-09" ? PILAR_CONTROLS.septiembre : null;
  if (!expected) return "fuera";
  if (remitos === expected.remitos && prendas === expected.prendas && cents(ventas) === cents(expected.ventas)) {
    return "coincide";
  }
  return "distinto";
}
