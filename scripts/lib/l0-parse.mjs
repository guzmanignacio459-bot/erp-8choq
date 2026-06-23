/** Parsers compartidos L0 — montos y campos GAS */

export function fieldSlug(label) {
  return String(label)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function cleanCell(value) {
  if (value == null) return "";
  if (typeof value === "object") return "";
  const s = String(value).trim();
  if (s === "" || s === "—" || s === "-") return "";
  return s;
}

export function parseAmount(v) {
  if (v == null || v === "") return 0;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  let s = String(v).trim().replace(/^\$/, "");
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",") && !s.includes(".")) {
    s = s.replace(",", ".");
  }
  const n = parseFloat(s.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function pickField(row, candidates, slugAliases = []) {
  for (const key of candidates) {
    const cleaned = cleanCell(row[key]);
    if (cleaned) return cleaned;
  }
  const normalized = new Set([
    ...candidates.map(fieldSlug),
    ...slugAliases.map(fieldSlug),
  ]);
  for (const [key, value] of Object.entries(row)) {
    const cleaned = cleanCell(value);
    if (cleaned && normalized.has(fieldSlug(key))) return cleaned;
  }
  return "";
}

export function normalizeIdRemito(id) {
  return String(id)
    .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, "-")
    .replace(/\s+/g, "")
    .trim();
}

export function extractTnOrderId(row) {
  const direct = pickField(row, [
    "TN_ORDER_ID",
    "TN Order ID",
    "tn_order_id",
    "tnOrderId",
  ]);
  if (direct) return direct;
  const detalle = pickField(row, [
    "Detalle general",
    "Detalle General",
    "detalleGeneral",
  ]);
  const match = detalle.match(/TN_ORDER_ID\s*=\s*(\d+)/i);
  return match?.[1]?.trim() ?? "";
}

export function customerExternalKey({ dni, nombre, telefono }) {
  const parts = [
    fieldSlug(dni || "sin-dni"),
    fieldSlug(nombre || "sin-nombre"),
    fieldSlug(telefono || ""),
  ].filter(Boolean);
  return parts.join("|");
}
