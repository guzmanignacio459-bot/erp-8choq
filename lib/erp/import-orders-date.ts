/**
 * Resolución de rangos para import-orders — presets UI → fromISO / toISO.
 * Convención local (misma que remitos-date / dashboard).
 */

import type {
  ErpOrdersImportPreset,
  ErpOrdersImportRequestBody,
} from "@/types/erp";

export type ResolvedImportRange = {
  fromISO: string;
  toISO: string;
  label: string;
};

export type ResolvedImportRequest = {
  fromISO: string;
  toISO: string;
  rangeLabel: string;
  singleOrderId?: string;
  dryRun: boolean;
  importMp: boolean;
  mpForce: boolean;
  fetchDetails: boolean;
  perPage: number;
  maxPages: number;
  throttleMs: number;
  useHourlySlots: boolean;
  slotHours: number;
};

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

function parseDayInput(value: string): Date | null {
  const raw = value.trim();
  if (!raw) return null;

  const isoDate = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDate) {
    const d = new Date(
      Number(isoDate[1]),
      Number(isoDate[2]) - 1,
      Number(isoDate[3])
    );
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const slash = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (slash) {
    const day = Number(slash[1]);
    const month = Number(slash[2]) - 1;
    let year = Number(slash[3]);
    if (year < 100) year += 2000;
    const d = new Date(year, month, day);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  return null;
}

function formatDayLabel(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function dayToRange(d: Date): ResolvedImportRange {
  const start = startOfDay(d);
  const end = endOfDay(d);
  return {
    fromISO: start.toISOString(),
    toISO: end.toISOString(),
    label: formatDayLabel(d),
  };
}

export function resolvePresetRange(
  preset: ErpOrdersImportPreset,
  options?: { date?: string; from?: string; to?: string }
): ResolvedImportRange {
  const now = new Date();
  const todayStart = startOfDay(now);

  switch (preset) {
    case "today":
      return {
        fromISO: todayStart.toISOString(),
        toISO: endOfDay(now).toISOString(),
        label: "Hoy",
      };
    case "yesterday": {
      const y = new Date(todayStart);
      y.setDate(y.getDate() - 1);
      return {
        ...dayToRange(y),
        label: "Ayer",
      };
    }
    case "singleDay": {
      const day = parseDayInput(options?.date ?? "");
      if (!day) {
        throw new Error("Fecha específica inválida (use YYYY-MM-DD).");
      }
      return {
        ...dayToRange(day),
        label: formatDayLabel(day),
      };
    }
    case "custom": {
      const fromRaw = (options?.from ?? "").trim();
      const toRaw = (options?.to ?? "").trim();
      if (!fromRaw || !toRaw) {
        throw new Error("Rango custom requiere from y to (YYYY-MM-DD).");
      }
      const fromDay = parseDayInput(fromRaw);
      const toDay = parseDayInput(toRaw);
      if (!fromDay || !toDay) {
        throw new Error("Rango custom inválido (use YYYY-MM-DD).");
      }
      if (fromDay.getTime() > toDay.getTime()) {
        throw new Error("La fecha desde no puede ser posterior a la fecha hasta.");
      }
      return {
        fromISO: startOfDay(fromDay).toISOString(),
        toISO: endOfDay(toDay).toISOString(),
        label: `${formatDayLabel(fromDay)} → ${formatDayLabel(toDay)}`,
      };
    }
    default:
      throw new Error(`Preset de importación desconocido: ${preset}`);
  }
}

/** Rango amplio para importar una orden puntual sin acotar por fecha. */
export function wideRangeForSingleOrder(): ResolvedImportRange {
  const from = new Date(2020, 0, 1, 0, 0, 0, 0);
  const to = endOfDay(new Date());
  to.setFullYear(to.getFullYear() + 1);
  return {
    fromISO: from.toISOString(),
    toISO: to.toISOString(),
    label: "Rango amplio (orden puntual)",
  };
}

export type HourlyImportSlot = {
  label: string;
  fromISO: string;
  toISO: string;
};

/** Divide un día en franjas horarias (p. ej. 6h → 4 bloques). */
export function buildHourlySlots(
  day: Date,
  slotHours = 6
): HourlyImportSlot[] {
  const hours = Math.max(1, Math.min(12, Math.floor(slotHours)));
  const dayStart = startOfDay(day);
  const slots: HourlyImportSlot[] = [];

  for (let h = 0; h < 24; h += hours) {
    const slotStart = new Date(dayStart);
    slotStart.setHours(h, 0, 0, 0);
    const slotEnd = new Date(dayStart);
    const endHour = Math.min(h + hours, 24);
    if (endHour >= 24) {
      slotEnd.setHours(23, 59, 59, 999);
    } else {
      slotEnd.setHours(endHour, 0, 0, 0);
      slotEnd.setMilliseconds(slotEnd.getMilliseconds() - 1);
    }
    const pad = (n: number) => String(n).padStart(2, "0");
    slots.push({
      label: `${pad(h)}:00–${endHour >= 24 ? "24:00" : `${pad(endHour)}:00`}`,
      fromISO: slotStart.toISOString(),
      toISO: slotEnd.toISOString(),
    });
  }

  return slots;
}

export function isSingleCalendarDay(fromISO: string, toISO: string): boolean {
  const from = new Date(fromISO);
  const to = new Date(toISO);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return false;
  return (
    from.getFullYear() === to.getFullYear() &&
    from.getMonth() === to.getMonth() &&
    from.getDate() === to.getDate()
  );
}

export function resolveImportRequest(
  body: ErpOrdersImportRequestBody
): ResolvedImportRequest {
  const singleOrderId = String(body.singleOrderId ?? "").trim() || undefined;

  let range: ResolvedImportRange;

  const fromISO = String(body.fromISO ?? "").trim();
  const toISO = String(body.toISO ?? "").trim();

  if (fromISO && toISO) {
    range = { fromISO, toISO, label: "Rango ISO directo" };
  } else if (body.preset) {
    range = resolvePresetRange(body.preset, {
      date: body.date,
      from: body.from,
      to: body.to,
    });
  } else if (singleOrderId) {
    range = wideRangeForSingleOrder();
  } else {
    throw new Error(
      "Indique preset, fromISO/toISO, o singleOrderId con preset/rango."
    );
  }

  return {
    fromISO: range.fromISO,
    toISO: range.toISO,
    rangeLabel: range.label,
    singleOrderId,
    dryRun: body.dryRun !== false,
    importMp: body.importMp === true,
    mpForce: body.mpForce === true,
    fetchDetails: body.fetchDetails === true,
    perPage: Math.max(1, Math.min(200, Number(body.perPage ?? 50))),
    maxPages: Math.max(1, Number(body.maxPages ?? 50)),
    throttleMs: Math.max(0, Number(body.throttleMs ?? 350)),
    useHourlySlots: body.useHourlySlots === true,
    slotHours: Math.max(1, Math.min(12, Number(body.slotHours ?? 6))),
  };
}
