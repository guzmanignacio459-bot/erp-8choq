import type { Decimal } from "@prisma/client/runtime/library";

export function decimalToNumber(v: Decimal | number | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  return Number(v);
}

export function decimalToNumberOrNull(
  v: Decimal | number | null | undefined
): number | null {
  if (v == null) return null;
  if (typeof v === "number") return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
