/**
 * Watermark incremental M5.1 — cursor updated_at TN
 */

export const M5_TN_ORDERS_SYNC_SCOPE = "m5_tn_orders_incremental";

/** Solapamiento para evitar pérdida en boundary de reloj/API */
export const M5_WATERMARK_OVERLAP_MS = 5 * 60 * 1000;

export function applyWatermarkOverlap(watermark: Date): Date {
  return new Date(watermark.getTime() - M5_WATERMARK_OVERLAP_MS);
}

export function parseTnUpdatedAtFromPayload(
  raw: Record<string, unknown> | null | undefined
): Date | null {
  if (!raw?.updated_at) return null;
  const d = new Date(String(raw.updated_at));
  return Number.isNaN(d.getTime()) ? null : d;
}
