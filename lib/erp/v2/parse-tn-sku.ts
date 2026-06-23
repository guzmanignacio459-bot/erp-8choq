/**
 * Parseo SKU TN — paridad import-orders / GAS parseSkuParts (M4.1)
 */

const VALID_SIZES = new Set([
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "XXL",
  "XXXL",
]);

export type ParsedTnSku = {
  sku: string;
  owner: "" | "SCNL" | "8Q";
  talle: string | null;
  isGifty: boolean;
  isStockable: boolean;
  warnings: string[];
};

export function parseTnSku(skuRaw: unknown): ParsedTnSku {
  const raw = String(skuRaw ?? "").trim().toUpperCase();
  const warnings: string[] = [];

  if (!raw) {
    return {
      sku: "",
      owner: "8Q",
      talle: null,
      isGifty: false,
      isStockable: false,
      warnings: ["missing_sku"],
    };
  }

  if (raw === "GIFTY" || raw.startsWith("GIFTY-")) {
    return {
      sku: "GIFTY",
      owner: "8Q",
      talle: "UNICO",
      isGifty: true,
      isStockable: false,
      warnings: [],
    };
  }

  const parts = raw.split("-").filter(Boolean);
  let owner: "" | "SCNL" = "";

  if (parts.length && parts[parts.length - 1] === "SCNL") {
    owner = "SCNL";
    parts.pop();
  }

  const last = parts.length ? parts[parts.length - 1] : "";
  const talle = VALID_SIZES.has(last) ? last : null;

  if (!talle) {
    warnings.push("invalid_talle");
  }

  return {
    sku: raw,
    owner: owner || "8Q",
    talle,
    isGifty: false,
    isStockable: Boolean(talle),
    warnings,
  };
}
