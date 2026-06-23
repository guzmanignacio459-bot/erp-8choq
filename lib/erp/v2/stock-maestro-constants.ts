/** Paridad GAS VALID_STOCK_SIZES / parseTnSku (M4.8) */
export const VALID_STOCK_SIZES = [
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "XXL",
  "XXXL",
] as const;

export type ValidStockSize = (typeof VALID_STOCK_SIZES)[number];

export const VALID_STOCK_SIZE_SET = new Set<string>(VALID_STOCK_SIZES);

export const VALID_SNAPSHOT_OWNERS = ["8Q", "SCNL"] as const;

export type SnapshotOwner = (typeof VALID_SNAPSHOT_OWNERS)[number];

export const STOCK_MAESTRO_SHEET_NAME = "STOCK MAESTRO";

export const STOCK_MAESTRO_SIZE_COLUMNS = [...VALID_STOCK_SIZES];

export const STOCK_MAESTRO_META_COLUMNS = ["SKU", "ARTICULO", "Stock Total"] as const;
