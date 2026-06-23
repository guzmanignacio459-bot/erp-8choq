/**
 * M4.1 — expansión qty → units (CLI mirror lib/erp/v2/expand-tn-order-item-units.ts)
 */

const VALID_SIZES = new Set(["XS", "S", "M", "L", "XL", "XXL", "XXXL"]);
const UNIT_SOURCE = "m4_unit_expand";

export function parseTnSku(skuRaw) {
  const raw = String(skuRaw ?? "").trim().toUpperCase();
  const warnings = [];

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
  let owner = "";
  if (parts.length && parts[parts.length - 1] === "SCNL") {
    owner = "SCNL";
    parts.pop();
  }

  const last = parts.length ? parts[parts.length - 1] : "";
  const talle = VALID_SIZES.has(last) ? last : null;
  if (!talle) warnings.push("invalid_talle");

  return {
    sku: raw,
    owner: owner || "8Q",
    talle,
    isGifty: false,
    isStockable: Boolean(talle),
    warnings,
  };
}

export function expandTnOrderItemToUnits(line) {
  const qty = Math.max(0, Math.round(Number(line.quantity) || 0));
  const unitPrice = Number(line.unitPrice) || 0;
  const warnings = [];
  const units = [];

  if (qty <= 0) {
    warnings.push({ tnOrderItemId: line.id, code: "invalid_quantity" });
    return { units, expectedCount: 0, warnings };
  }

  const parsed = parseTnSku(line.sku);
  for (const w of parsed.warnings) {
    warnings.push({ tnOrderItemId: line.id, code: w });
  }

  for (let unitIndex = 0; unitIndex < qty; unitIndex++) {
    units.push({
      tnOrderId: line.tnOrderId,
      tnOrderItemId: line.id,
      unitIndex,
      sku: parsed.sku || line.sku,
      talle: parsed.talle,
      owner: parsed.owner || null,
      unitPrice,
      isGifty: parsed.isGifty,
      isStockable: parsed.isStockable,
      parseWarnings: parsed.warnings.length ? parsed.warnings : null,
      source: UNIT_SOURCE,
    });
  }

  return { units, expectedCount: qty, warnings };
}
