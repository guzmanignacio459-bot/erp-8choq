import type { PeriodPreset } from "@/lib/erp/remitos-date";

function formatIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export type PeriodQueryRange = { from?: string; to?: string };

/**
 * Rango YYYY-MM-DD para APIs GAS / filtros cliente.
 * Día específico tiene prioridad sobre preset y rango personalizado.
 */
export function getPeriodQueryRange(
  preset: PeriodPreset,
  customFrom: string,
  customTo: string,
  specificDay = ""
): PeriodQueryRange {
  const day = specificDay.trim();
  if (day) {
    return { from: day, to: day };
  }

  if (preset === "all") return {};

  const now = new Date();
  const todayStart = startOfDay(now);

  switch (preset) {
    case "today":
      return { from: formatIsoDate(todayStart), to: formatIsoDate(now) };
    case "yesterday": {
      const y = new Date(todayStart);
      y.setDate(y.getDate() - 1);
      return { from: formatIsoDate(y), to: formatIsoDate(y) };
    }
    case "7d": {
      const start = new Date(todayStart);
      start.setDate(start.getDate() - 6);
      return { from: formatIsoDate(start), to: formatIsoDate(now) };
    }
    case "30d": {
      const start = new Date(todayStart);
      start.setDate(start.getDate() - 29);
      return { from: formatIsoDate(start), to: formatIsoDate(now) };
    }
    case "custom": {
      const range: PeriodQueryRange = {};
      if (customFrom.trim()) range.from = customFrom.trim();
      if (customTo.trim()) range.to = customTo.trim();
      return range;
    }
    default:
      return {};
  }
}

/** Normaliza rango parcial a from/to para filterRemitosByArtDateRange. */
export function normalizeArtDateBounds(
  range: PeriodQueryRange
): { from: string; to: string } | null {
  const from = range.from?.trim() ?? "";
  const to = range.to?.trim() ?? "";
  if (!from && !to) return null;
  if (from && to) return { from, to };
  const single = from || to;
  return { from: single, to: single };
}
