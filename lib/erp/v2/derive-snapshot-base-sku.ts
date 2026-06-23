import { parseTnSku } from "@/lib/erp/v2/parse-tn-sku";
import type { SnapshotOwner } from "@/lib/erp/v2/stock-maestro-constants";

export type NormalizedEmbeddedSku = {
  sourceSku: string;
  baseSku: string;
  talle: string;
  owner: SnapshotOwner;
};

/** SKU base para snapshot — quita talle embebido y sufijo SCNL */
export function deriveSnapshotBaseSku(skuRaw: string): string | null {
  const parsed = parseTnSku(skuRaw);
  if (!parsed.talle) return null;

  const suffix = `-${parsed.talle}`;
  const ownerSuffix = parsed.owner === "SCNL" ? "-SCNL" : "";
  const sku = String(skuRaw ?? "").trim().toUpperCase();

  if (sku.endsWith(`${suffix}${ownerSuffix}`)) {
    return sku.slice(0, -(suffix.length + ownerSuffix.length));
  }
  if (sku.endsWith(suffix)) {
    return sku.slice(0, -suffix.length);
  }
  return null;
}

export function normalizeEmbeddedSku(skuRaw: string): NormalizedEmbeddedSku | null {
  const parsed = parseTnSku(skuRaw);
  if (!parsed.talle) return null;

  const baseSku = deriveSnapshotBaseSku(skuRaw);
  if (!baseSku) return null;

  return {
    sourceSku: parsed.sku,
    baseSku,
    talle: parsed.talle,
    owner: (parsed.owner || "8Q") as SnapshotOwner,
  };
}

export function hasEmbeddedTalle(skuRaw: string): boolean {
  return parseTnSku(skuRaw).talle !== null;
}
