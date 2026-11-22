export type EstadoFila = "nueva" | "existente" | "modificada" | "incompleta" | "duplicada";

export function decidirFila(input: {
  id: string;
  completa: boolean;
  yaGuardada: boolean;
  hashNuevo: string | null;
  hashGuardado: string | null;
  vista: boolean;
}): EstadoFila {
  if (input.vista) return "duplicada";
  if (!input.id || !input.completa) return "incompleta";
  if (input.yaGuardada && input.hashGuardado && input.hashNuevo && input.hashGuardado !== input.hashNuevo) {
    return "modificada";
  }
  if (input.yaGuardada) return "existente";
  return "nueva";
}

export function leerImporte(value: string): number | null {
  const trimmed = value.trim().replace(",", ".");
  if (!trimmed) return null;
  const numero = Number(trimmed);
  if (!Number.isFinite(numero) || numero < 0) return null;
  return numero;
}

export function fechaDeSerial(serial: number): string | null {
  if (!Number.isFinite(serial)) return null;
  const dias = Math.floor(serial);
  const marca = Date.UTC(1899, 11, 30) + dias * 86400000;
  return new Date(marca).toISOString().slice(0, 10);
}

export const MAPA_REMITO = {
  "ID Remito": "id_remito",
  "Fecha": "fecha_venta",
  "Metodo De Pago": "metodo_pago",
  "Total De Prendas": "total_prendas",
  "Subtotal": "subtotal",
  "Shipping Customer Cost": "shipping_customer_cost",
  "Envio Owner": "envio_owner",
  "Shipping Owner Cost": "shipping_owner_cost",
  "Recargo/Descuento": "recargo_descuento",
  "Total Final": "total_final",
  "Estado": "estado",
  "Dueño SCNL Cant": "scnl_cant",
  "Dueño SCNL Monto": "scnl_monto",
  "TN_ORDER_ID": "tn_order_id",
  "MP_PAYMENT_ID": "mp_payment_id",
  "MP_STATUS": "mp_status",
  "MP_DATE_APPROVED": "mp_date_approved",
  "MP_MONEY_RELEASE_DATE": "mp_money_release_date",
  "MP_ACREDITADO_FECHA": "mp_acreditado_fecha",
  "MP_TRANSACTION_AMOUNT": "mp_transaction_amount",
  "MP_NET_RECEIVED_AMOUNT": "mp_net_received_amount",
  "MP_TAX_TOTAL_REAL": "mp_tax_total_real",
  "MP_FINANCING_TOTAL_REAL": "mp_financing_total_real",
  "MP_FEE_TOTAL_REAL": "mp_fee_total_real",
  "MP_PLATFORM_FEE_TOTAL_REAL": "mp_platform_fee_total_real",
  "MP_PAYMENT_TYPE": "mp_payment_type",
  "MP_PAYMENT_METHOD": "mp_payment_method",
  "MP_INSTALLMENTS": "mp_installments",
  "MP_TOTAL_COST_REAL": "mp_total_cost_real",
  "MP_NETO_REAL_ORDEN": "mp_neto_real_orden",
  "MP_COST_PERCENT_REAL": "mp_cost_percent_real",
  "Costo De Envio": "costo_envio",
  "Costo Envio Owner": "costo_envio_owner",
} as const;

export const MAPA_PRENDA = {
  "Fecha": "fecha_venta",
  "ID Remito": "id_remito",
  "SKU": "sku",
  "Articulo": "articulo",
  "Talle": "talle",
  "Cantidad": "cantidad",
  "Precio Unitario": "precio_unitario",
  "Owner": "owner",
  "DESCUENTO_ASIGNADO": "descuento_asignado",
  "SHIPPING_ASIGNADO": "shipping_asignado",
  "ENVIO_OWNER": "envio_owner",
  "NETO_PRENDA": "neto_prenda",
  "Metodo De Pago": "metodo_pago",
  "MP_PAYMENT_ID": "mp_payment_id",
  "MP_STATUS": "mp_status",
  "MP_INSTALLMENTS": "mp_installments",
  "MP_PAYMENT_TYPE": "mp_payment_type",
  "MP_METHOD": "mp_method",
  "MP_TAX_ASIGNADO_REAL": "mp_tax_asignado_real",
  "MP_FINANCING_ASIGNADO_REAL": "mp_financing_asignado_real",
  "MP_FEE_ASIGNADO_REAL": "mp_fee_asignado_real",
  "MP_PLATFORM_FEE_ASIGNADO_REAL": "mp_platform_fee_asignado_real",
  "MP_TOTAL_COST_ASIGNADO_REAL": "mp_total_cost_asignado_real",
  "NETO_PRENDA_REAL": "neto_prenda_real",
  "NETO_PRENDA_SCNL": "neto_prenda_scnl",
  "NETO PRENDA 8Q": "neto_prenda_8q",
  "FEE_ASIGNADO": "fee_asignado",
} as const;
