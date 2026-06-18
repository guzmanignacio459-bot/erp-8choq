import {
  normalizeEmbeddedSku,
  type NormalizedEmbeddedSku,
} from "@/lib/erp/v2/derive-snapshot-base-sku";
import { parseTnSku } from "@/lib/erp/v2/parse-tn-sku";
import {
  VALID_STOCK_SIZE_SET,
  type SnapshotOwner,
} from "@/lib/erp/v2/stock-maestro-constants";

export type NormalizedStockMovementGrain = {
  sourceSku: string;
  sku: string;
  talle: string;
  owner: SnapshotOwner;
  normalized: boolean;
  method: "embedded_talle" | "passthrough";
};

/**
 * Normaliza grain ledger → paridad snapshot T0 (M4.5d)
 * Variant SKU + talle embebido → SKU base + talle
 */
export function normalizeStockMovementGrain(input: {
  sku: string;
  talle?: string | null;
  owner?: string | null;
}): NormalizedStockMovementGrain {
  const sourceSku = String(input.sku ?? "").trim().toUpperCase();
  const embedded: NormalizedEmbeddedSku | null = normalizeEmbeddedSku(sourceSku);

  if (embedded) {
    return {
      sourceSku,
      sku: embedded.baseSku.trim().toUpperCase(),
      talle: embedded.talle,
      owner: embedded.owner,
      normalized: true,
      method: "embedded_talle",
    };
  }

  const parsed = parseTnSku(sourceSku);
  const unitTalle = String(input.talle ?? "").trim().toUpperCase();
  const talle =
    unitTalle && VALID_STOCK_SIZE_SET.has(unitTalle)
      ? unitTalle
      : parsed.talle ?? unitTalle;

  const owner = (String(input.owner ?? "").trim() ||
    parsed.owner ||
    "8Q") as SnapshotOwner;

  return {
    sourceSku,
    sku: sourceSku.trim(),
    talle,
    owner: owner === "SCNL" ? "SCNL" : "8Q",
    normalized: false,
    method: "passthrough",
  };
}

export function stockMovementGrainKey(
  sku: string,
  talle: string | null | undefined,
  owner: string | null | undefined
): string {
  const g = normalizeStockMovementGrain({ sku, talle, owner });
  return `${g.sku}\0${g.talle}\0${g.owner}`;
}

export function movementNeedsGrainNormalization(input: {
  sku: string;
  talle?: string | null;
  owner?: string | null;
}): boolean {
  const g = normalizeStockMovementGrain(input);
  const currentTalle = String(input.talle ?? "").trim().toUpperCase();
  const currentOwner = String(input.owner ?? "8Q").trim() || "8Q";
  return (
    g.sku !== String(input.sku ?? "").trim().toUpperCase() ||
    g.talle !== currentTalle ||
    g.owner !== currentOwner
  );
}
