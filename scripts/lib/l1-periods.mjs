/** Períodos L1 — Abr / May / Jun 01–08 (ART) */

export const L1_GLOBAL_FROM = "2026-04-01";
export const L1_GLOBAL_TO = "2026-06-08";

export const L1_PERIODS = [
  {
    key: "abril",
    label: "Abril 2026",
    from: "2026-04-01",
    to: "2026-04-30",
  },
  {
    key: "mayo",
    label: "Mayo 2026",
    from: "2026-05-01",
    to: "2026-05-31",
  },
  {
    key: "junio",
    label: "Junio 01–08 2026",
    from: "2026-06-01",
    to: "2026-06-08",
  },
];

/** TN fetch windows (ISO UTC — formato API TN) */
export const TN_WIDE_CREATED_MIN = "2026-02-01T00:00:00.000Z";
export const TN_WIDE_CREATED_MAX = "2026-07-15T23:59:59.999Z";

export function tnCreatedWindowForPeriod(period) {
  return {
    created_at_min: `${period.from}T00:00:00.000Z`,
    created_at_max: `${period.to}T23:59:59.999Z`,
  };
}
