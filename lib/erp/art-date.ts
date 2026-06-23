/**
 * Calendario ERP — siempre America/Argentina/Buenos_Aires.
 * Strings YYYY-MM-DD (type="date") nunca pasan por Date.parse.
 */

export const ERP_TIMEZONE = "America/Argentina/Buenos_Aires";

const ART_OFFSET = "-03:00";

export type ArtCalendarDay = { y: number; m: number; d: number };

const ISO_DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseArtCalendarDayInput(str: string): ArtCalendarDay | null {
  const raw = str.trim();
  const m = raw.match(ISO_DAY_RE);
  if (!m) return null;

  const y = Number(m[1]);
  const month = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || month < 1 || month > 12 || d < 1 || d > 31) {
    return null;
  }

  const probe = new Date(
    `${y}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}T12:00:00${ART_OFFSET}`
  );
  if (Number.isNaN(probe.getTime())) return null;

  const parts = getArtCalendarParts(probe.getTime());
  if (parts.y !== y || parts.m !== month || parts.d !== d) return null;

  return { y, m: month, d };
}

export function parseArtInstantMs(iso: string): number | null {
  const raw = iso.trim();
  if (!raw) return null;

  if (ISO_DAY_RE.test(raw)) {
    const day = parseArtCalendarDayInput(raw);
    if (!day) return null;
    return artDayBoundsMs(day.y, day.m, day.d).startMs;
  }

  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function artDayBoundsMs(
  y: number,
  m: number,
  d: number
): { startMs: number; endMs: number } {
  const ymd = `${y}-${pad2(m)}-${pad2(d)}`;
  const startMs = Date.parse(`${ymd}T00:00:00.000${ART_OFFSET}`);
  const endMs = Date.parse(`${ymd}T23:59:59.999${ART_OFFSET}`);
  return { startMs, endMs };
}

export function artRangeBoundsMs(
  fromYmd: string,
  toYmd: string
): { startMs: number; endMs: number } | null {
  const from = parseArtCalendarDayInput(fromYmd);
  const to = parseArtCalendarDayInput(toYmd);
  if (!from || !to) return null;

  const start = artDayBoundsMs(from.y, from.m, from.d);
  const end = artDayBoundsMs(to.y, to.m, to.d);
  if (start.startMs > end.endMs) return null;

  return { startMs: start.startMs, endMs: end.endMs };
}

export function isInstantInArtRange(
  instantMs: number,
  fromYmd: string,
  toYmd: string
): boolean {
  const bounds = artRangeBoundsMs(fromYmd, toYmd);
  if (!bounds) return false;
  return instantMs >= bounds.startMs && instantMs <= bounds.endMs;
}

export function getArtCalendarParts(instantMs: number): ArtCalendarDay {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: ERP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(new Date(instantMs));
  const pick = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? NaN);

  return { y: pick("year"), m: pick("month"), d: pick("day") };
}

export function artCalendarDayKey(instantMs: number): string {
  const { y, m, d } = getArtCalendarParts(instantMs);
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

export function formatInstantArt(iso: string): string {
  const ms = parseArtInstantMs(iso);
  if (ms == null) return iso.trim();

  const fmt = new Intl.DateTimeFormat("es-AR", {
    timeZone: ERP_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return fmt.format(new Date(ms)).replace(",", "");
}

export function artTodayYmd(): string {
  return artCalendarDayKey(Date.now());
}

export function artDefaultRange30d(): { from: string; to: string } {
  const to = artTodayYmd();
  const toDay = parseArtCalendarDayInput(to);
  if (!toDay) return { from: to, to };

  const anchor = new Date(
    `${toDay.y}-${pad2(toDay.m)}-${pad2(toDay.d)}T12:00:00${ART_OFFSET}`
  );
  anchor.setUTCDate(anchor.getUTCDate() - 29);
  const from = artCalendarDayKey(anchor.getTime());

  return { from, to };
}

export function formatArtDateRangeLabel(fromYmd: string, toYmd: string): string {
  const fmt = new Intl.DateTimeFormat("es-AR", {
    timeZone: ERP_TIMEZONE,
    dateStyle: "medium",
  });

  const from = parseArtCalendarDayInput(fromYmd);
  const to = parseArtCalendarDayInput(toYmd);
  if (!from || !to) {
    if (fromYmd && toYmd) return `Del ${fromYmd} al ${toYmd}`;
    return "Rango personalizado";
  }

  const fromLabel = fmt.format(
    new Date(artDayBoundsMs(from.y, from.m, from.d).startMs)
  );
  const toLabel = fmt.format(
    new Date(artDayBoundsMs(to.y, to.m, to.d).startMs)
  );

  if (fromYmd === toYmd) return fromLabel;
  return `Del ${fromLabel} al ${toLabel}`;
}
