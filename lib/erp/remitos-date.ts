import type { ErpRemito } from "@/types/erp";

export type PeriodPreset =
  | "today"
  | "yesterday"
  | "7d"
  | "30d"
  | "custom"
  | "all";

/** Parsea Fecha de remito (ISO, dd/mm/yyyy, yyyy-mm-dd) sin reinterpretar montos */
export function parseRemitoFecha(fecha: string): Date | null {
  const raw = fecha.trim();
  if (!raw) return null;

  const iso = Date.parse(raw);
  if (!Number.isNaN(iso)) {
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) return d;
  }

  const slash = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (slash) {
    const day = Number(slash[1]);
    const month = Number(slash[2]) - 1;
    let year = Number(slash[3]);
    if (year < 100) year += 2000;
    const d = new Date(year, month, day);
    if (!Number.isNaN(d.getTime())) return d;
  }

  const isoDate = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDate) {
    const d = new Date(
      Number(isoDate[1]),
      Number(isoDate[2]) - 1,
      Number(isoDate[3])
    );
    if (!Number.isNaN(d.getTime())) return d;
  }

  return null;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function extractIdNumber(id: string): number {
  const match = id.match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}

function remitoFechaSortKey(r: ErpRemito): string {
  return r.fechaRaw || r.fechaDisplay || "";
}

/** Más reciente primero; fallback por ID Remito */
export function compareRemitosByRecency(a: ErpRemito, b: ErpRemito): number {
  const da = parseRemitoFecha(remitoFechaSortKey(a));
  const db = parseRemitoFecha(remitoFechaSortKey(b));

  if (da && db) return db.getTime() - da.getTime();
  if (da && !db) return -1;
  if (!da && db) return 1;

  return extractIdNumber(b.idRemito) - extractIdNumber(a.idRemito);
}

export function sortRemitosByDateDesc(remitos: ErpRemito[]): ErpRemito[] {
  return [...remitos].sort(compareRemitosByRecency);
}

export function filterRemitosByPeriod(
  remitos: ErpRemito[],
  preset: PeriodPreset,
  customFrom?: string,
  customTo?: string
): ErpRemito[] {
  if (preset === "all") return remitos;

  const now = new Date();
  const todayStart = startOfDay(now);

  let rangeStart: Date;
  let rangeEnd: Date = endOfDay(now);

  switch (preset) {
    case "today":
      rangeStart = todayStart;
      break;
    case "yesterday": {
      const y = new Date(todayStart);
      y.setDate(y.getDate() - 1);
      rangeStart = y;
      rangeEnd = endOfDay(y);
      break;
    }
    case "7d": {
      rangeStart = new Date(todayStart);
      rangeStart.setDate(rangeStart.getDate() - 6);
      break;
    }
    case "30d": {
      rangeStart = new Date(todayStart);
      rangeStart.setDate(rangeStart.getDate() - 29);
      break;
    }
    case "custom": {
      const from = customFrom ? parseRemitoFecha(customFrom) : null;
      const to = customTo ? parseRemitoFecha(customTo) : null;
      if (!from && !to) return remitos;
      rangeStart = from ? startOfDay(from) : new Date(0);
      rangeEnd = to ? endOfDay(to) : endOfDay(now);
      break;
    }
    default:
      return remitos;
  }

  return remitos.filter((r) => {
    const d = parseRemitoFecha(remitoFechaSortKey(r));
    if (!d) return false;
    return d.getTime() >= rangeStart.getTime() && d.getTime() <= rangeEnd.getTime();
  });
}

export function filterRemitosByDay(
  remitos: ErpRemito[],
  dayISO: string
): ErpRemito[] {
  const target =
    parseRemitoFecha(dayISO) ??
    (dayISO ? new Date(`${dayISO}T12:00:00`) : null);

  if (!target || Number.isNaN(target.getTime())) return remitos;

  return remitos.filter((r) => {
    const d = parseRemitoFecha(remitoFechaSortKey(r));
    return d ? isSameCalendarDay(d, target) : false;
  });
}

const PERIOD_LABELS: Record<Exclude<PeriodPreset, "custom">, string> = {
  today: "Hoy",
  yesterday: "Ayer",
  "7d": "Últimos 7 días",
  "30d": "Últimos 30 días",
  all: "Todos los períodos",
};

export function getAppliedPeriodLabel(options: {
  preset: PeriodPreset;
  customFrom: string;
  customTo: string;
  specificDay: string | null;
}): string {
  if (options.specificDay) {
    try {
      return `Día ${new Intl.DateTimeFormat("es-AR", { dateStyle: "medium" }).format(
        new Date(`${options.specificDay}T12:00:00`)
      )}`;
    } catch {
      return `Día ${options.specificDay}`;
    }
  }

  if (options.preset === "custom") {
    if (options.customFrom && options.customTo) {
      return `Del ${options.customFrom} al ${options.customTo}`;
    }
    if (options.customFrom) return `Desde ${options.customFrom}`;
    if (options.customTo) return `Hasta ${options.customTo}`;
    return "Rango personalizado";
  }

  return PERIOD_LABELS[options.preset];
}

export const DEFAULT_PERIOD_PRESET: PeriodPreset = "30d";
