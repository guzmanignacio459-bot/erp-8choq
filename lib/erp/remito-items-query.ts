import type { ResolvedPeriodRange } from "@/lib/erp/period-query-range";

/** Firma estable del fetch GAS (período + filtros servidor). */
export function buildRemitoItemsQuerySignature(
  resolved: ResolvedPeriodRange,
  gasSku: string,
  gasOwner: string
): string | null {
  if (resolved.kind === "invalid") return null;

  const parts: Record<string, string> = {
    period:
      resolved.kind === "all"
        ? "all"
        : `bounded:${resolved.from}:${resolved.to}`,
    sku: gasSku.trim(),
    owner: gasOwner.trim(),
  };

  return JSON.stringify(parts);
}

export function buildRemitoItemsApiUrl(signature: string | null): string | null {
  if (!signature) return null;

  const parts = JSON.parse(signature) as {
    period: string;
    sku: string;
    owner: string;
  };

  const params = new URLSearchParams();
  const bounded = /^bounded:(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/;
  const match = bounded.exec(parts.period);
  if (match) {
    params.set("from", match[1]);
    params.set("to", match[2]);
  }
  if (parts.sku) params.set("sku", parts.sku);
  if (parts.owner) params.set("owner", parts.owner);

  return `/api/erp/remito-items${params.toString() ? `?${params}` : ""}`;
}
