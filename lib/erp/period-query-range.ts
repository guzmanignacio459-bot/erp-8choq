import { formatArtDateRangeLabel } from "@/lib/erp/art-date";
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

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidYmd(value: string): boolean {
  const s = value.trim();
  if (!YMD_RE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return (
    dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
  );
}

export type PeriodQueryRange = { from: string; to: string };

export type ResolvedPeriodRange =
  | { kind: "bounded"; from: string; to: string }
  | { kind: "all" }
  | { kind: "invalid"; message: string };

function normalizeFromTo(from: string, to: string): PeriodQueryRange {
  if (from <= to) return { from, to };
  return { from: to, to: from };
}

/** Bounds YYYY-MM-DD para presets fijos (no custom / all). */
export function getBoundsForPreset(
  preset: PeriodPreset
): PeriodQueryRange | null {
  if (preset === "all" || preset === "custom") return null;

  const now = new Date();
  const todayStart = startOfDay(now);

  switch (preset) {
    case "today":
      return {
        from: formatIsoDate(todayStart),
        to: formatIsoDate(now),
      };
    case "yesterday": {
      const y = new Date(todayStart);
      y.setDate(y.getDate() - 1);
      const ymd = formatIsoDate(y);
      return { from: ymd, to: ymd };
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
    default:
      return null;
  }
}

/**
 * Rango efectivo para APIs y filtros cliente.
 * Solo usa preset + dateFrom + dateTo (día único: from === to).
 */
export function getPeriodQueryRange(
  preset: PeriodPreset,
  dateFrom: string,
  dateTo: string
): PeriodQueryRange | null {
  if (preset === "all") return null;

  if (preset === "custom") {
    const from = dateFrom.trim();
    const to = dateTo.trim();
    if (!from || !to) return null;
    if (!isValidYmd(from) || !isValidYmd(to)) return null;
    return normalizeFromTo(from, to);
  }

  return getBoundsForPreset(preset);
}

export function resolvePeriodRange(
  preset: PeriodPreset,
  dateFrom: string,
  dateTo: string
): ResolvedPeriodRange {
  if (preset === "all") return { kind: "all" };

  if (preset === "custom") {
    const from = dateFrom.trim();
    const to = dateTo.trim();
    if (!from || !to) {
      return {
        kind: "invalid",
        message: "Seleccioná fecha Desde y Hasta para el rango personalizado.",
      };
    }
    if (!isValidYmd(from) || !isValidYmd(to)) {
      return {
        kind: "invalid",
        message: "Las fechas Desde/Hasta no son válidas.",
      };
    }
    const bounds = normalizeFromTo(from, to);
    return { kind: "bounded", from: bounds.from, to: bounds.to };
  }

  const bounds = getBoundsForPreset(preset);
  if (!bounds) {
    return { kind: "invalid", message: "No se pudo calcular el período seleccionado." };
  }
  return { kind: "bounded", from: bounds.from, to: bounds.to };
}

export function appendPeriodRangeToSearchParams(
  params: URLSearchParams,
  resolved: ResolvedPeriodRange
): void {
  if (resolved.kind !== "bounded") return;
  params.set("from", resolved.from);
  params.set("to", resolved.to);
}

/** Etiqueta de rango activo (sin día específico aparte). */
export function getPeriodRangeLabel(
  preset: PeriodPreset,
  dateFrom: string,
  dateTo: string
): string {
  const resolved = resolvePeriodRange(preset, dateFrom, dateTo);
  if (resolved.kind === "invalid") return resolved.message;
  if (resolved.kind === "all") return "Todos los períodos";
  if (preset === "custom") {
    return formatArtDateRangeLabel(resolved.from, resolved.to);
  }
  const labels: Record<Exclude<PeriodPreset, "custom" | "all">, string> = {
    today: "Hoy",
    yesterday: "Ayer",
    "7d": "Últimos 7 días",
    "30d": "Últimos 30 días",
  };
  if (preset in labels) {
    return `${labels[preset as keyof typeof labels]} (${formatArtDateRangeLabel(resolved.from, resolved.to)})`;
  }
  return formatArtDateRangeLabel(resolved.from, resolved.to);
}

/** Normaliza rango acotado para filterRemitosByArtDateRange. */
export function normalizeArtDateBounds(
  range: PeriodQueryRange | null
): { from: string; to: string } | null {
  if (!range?.from || !range?.to) return null;
  return range;
}
