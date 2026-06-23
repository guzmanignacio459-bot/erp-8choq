/**
 * Clave determinística e idempotente para tn_order_item_units.
 * Paridad DB: @@unique([tnOrderItemId, unitIndex])
 */

export function buildTnOrderItemUnitKey(
  tnOrderItemId: string,
  unitIndex: number
): string {
  return `${tnOrderItemId}:${unitIndex}`;
}

export function parseTnOrderItemUnitKey(
  key: string
): { tnOrderItemId: string; unitIndex: number } | null {
  const sep = key.lastIndexOf(":");
  if (sep <= 0) return null;
  const tnOrderItemId = key.slice(0, sep);
  const unitIndex = Number(key.slice(sep + 1));
  if (!tnOrderItemId || !Number.isInteger(unitIndex) || unitIndex < 0) {
    return null;
  }
  return { tnOrderItemId, unitIndex };
}
