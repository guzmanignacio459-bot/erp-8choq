import { parseRemitoAmount } from "@/lib/erp/remitos-kpis";
import type { ErpRemito } from "@/types/erp";

export type PagoEnvioLabel = "Cliente" | "8Q" | "Sin envío / no informado";

/**
 * Interpretación visual de quién pagó el envío — solo lectura de columnas existentes.
 * No recalcula shipping ni prorrateos.
 */
export function resolvePagoEnvioLabel(remito: ErpRemito): PagoEnvioLabel {
  const customerCost = parseRemitoAmount(remito.shippingCustomerCost);
  const ownerCost = parseRemitoAmount(remito.shippingOwnerCost);
  const ownerText = (remito.envioOwner ?? "").trim().toUpperCase();

  if (customerCost > 0) return "Cliente";
  if (ownerCost > 0) return "8Q";

  if (ownerText.includes("8Q") || ownerText.includes("OCHOQ")) return "8Q";
  if (ownerText.includes("CLIENTE") || ownerText.includes("CUSTOMER")) {
    return "Cliente";
  }

  if (customerCost === 0 && ownerCost === 0) {
    return "Sin envío / no informado";
  }

  return "Sin envío / no informado";
}
