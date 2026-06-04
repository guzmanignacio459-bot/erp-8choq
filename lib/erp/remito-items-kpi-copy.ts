/**
 * Definiciones de KPIs monetarios REMITO_ITEMS (solo lectura).
 * No recalculan netos del sheet — agregan columnas existentes.
 */

export const REMITO_ITEMS_KPI_COPY = {
  brutoLista: {
    label: "Bruto lista prendas",
    hint: "Σ (Precio Unitario × cant.). Precio de lista por prenda; no es facturación ni Total Final.",
  },
  netoPrenda: {
    label: "Neto prendas (NETO_PRENDA)",
    hint: "Σ (NETO_PRENDA × cant.). Prorrateo por prenda; comparable a Total Final por remito (~diferencias por envío de cabecera).",
  },
  descuento: {
    label: "Descuento comercial asignado",
    hint: "Σ (DESCUENTO_ASIGNADO × cant.). Parte del descuento del remito prorrateada; no es el total facturado.",
  },
  shipping: {
    label: "Envío asignado (cliente)",
    hint: "Σ (SHIPPING_ASIGNADO × cant.). Envío prorrateado por prenda.",
  },
  fee: {
    label: "Fee asignado",
    hint: "Σ (FEE_ASIGNADO × cant.). Comisión/fee prorrateado por prenda.",
  },
  mpFee: {
    label: "Costo MP asignado real",
    hint: "Σ costo MP por prenda (total o fee + plataforma). No es facturación.",
  },
} as const;
