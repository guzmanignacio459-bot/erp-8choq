/**
 * M6.5.4 — Reglas históricas transferencias junio 2026 (ART)
 */

import { isInstantInArtRange } from "@/lib/erp/art-date";

export const JUNE_2026_FROM = "2026-06-01";
export const JUNE_2026_TO = "2026-06-30";

export const M6_5_4_HISTORICAL_RULES = [
  { from: "2026-06-03", to: "2026-06-05", accountName: "Galicia", ratePercent: 5 },
  { from: "2026-06-06", to: "2026-06-08", accountName: "Ignacio", ratePercent: 0 },
  { from: "2026-06-09", to: "2026-06-09", accountName: "Serbertex", ratePercent: 0 },
  { from: "2026-06-10", to: "2026-06-10", accountName: "Galicia", ratePercent: 5 },
  { from: "2026-06-11", to: "2026-06-11", accountName: "Serbertex", ratePercent: 0 },
  { from: "2026-06-12", to: "2026-06-15", accountName: "Galicia", ratePercent: 5 },
  { from: "2026-06-16", to: "2026-06-23", accountName: "Lucia", ratePercent: 0 },
  { from: "2026-06-24", to: "2026-06-26", accountName: "Galicia", ratePercent: 5 },
  { from: "2026-06-27", to: "2026-06-27", accountName: "Ignacio", ratePercent: 0 },
  { from: "2026-06-28", to: "2026-06-28", accountName: "Galicia", ratePercent: 5 },
  { from: "2026-06-29", to: "2026-06-29", accountName: "Ignacio", ratePercent: 0 },
] as const;

export type HistoricalJuneRule = (typeof M6_5_4_HISTORICAL_RULES)[number];

export function resolveHistoricalJuneTransferRule(
  paidMs: number
): HistoricalJuneRule | null {
  for (const rule of M6_5_4_HISTORICAL_RULES) {
    if (isInstantInArtRange(paidMs, rule.from, rule.to)) return rule;
  }
  return null;
}

export const M6_5_4_BACKFILL_SOURCE = "MANUAL" as const;
