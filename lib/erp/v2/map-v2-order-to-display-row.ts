import { formatInstantArt } from "@/lib/erp/art-date";
import { commercialStatusLabel } from "@/lib/erp/v2/commercial-status-labels";
import type { ErpRemitoDisplayRow } from "@/types/erp-remitos-display";
import type { V2CommercialOrder } from "@/types/erp-v2-api";

function moneyStr(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "";
  return n.toFixed(2);
}

/**
 * Adapta V2CommercialOrder → fila visual ErpRemito sin recalcular tn_total.
 */
export function mapV2CommercialOrderToDisplayRow(
  order: V2CommercialOrder
): ErpRemitoDisplayRow {
  const erp = order.erp;
  const fechaIso = order.tnCreatedAt ?? order.tnPaidAt ?? "";
  const fechaDisplay = fechaIso ? formatInstantArt(fechaIso) : "";
  const tnOnlyPendingErp =
    !erp?.erpOrderId ||
    erp.reconciliationStatus === "tn_only_pending_erp";

  const idRemito = erp?.erpOrderId ?? `TN-${order.tnOrderId}`;

  return {
    idRemito,
    fechaRaw: fechaIso,
    fechaDisplay,
    nombre: order.customerName ?? erp?.nombre ?? "—",
    dni: order.customerDni ?? "",
    provinciaLocalidad: order.provinceLocalidad ?? "",
    telefono: order.customerPhone ?? "",
    transporte: order.shippingOption ?? erp?.transporte ?? "",
    metodoDePago: order.paymentMethod ?? erp?.metodoPago ?? "",
    vendedor: "",
    condicionCompra: "",
    totalPrendas: erp ? String(erp.totalPrendas ?? 0) : "",
    subtotal: moneyStr(order.tnSubtotal),
    shippingCustomerCost: moneyStr(order.tnShipping),
    envioOwner: order.shippingOwner ?? "",
    shippingOwnerCost: "",
    recargoDescuento: moneyStr(order.tnDiscount),
    totalFinal: moneyStr(order.tnTotal),
    estado: commercialStatusLabel(order.commercialStatus),
    tnOrderId: order.tnOrderId,
    neonMeta: {
      commercialStatus: order.commercialStatus,
      reconciliationStatus: erp?.reconciliationStatus ?? null,
      hasErpRemito: Boolean(erp?.erpOrderId),
      tnOnlyPendingErp,
      erpOrderId: erp?.erpOrderId ?? null,
      tnTotal: order.tnTotal,
      tnCreatedAt: order.tnCreatedAt,
      operational: erp
        ? {
            fechaErp: erp.fechaErp,
            totalFinalErp: erp.totalFinalErp,
            totalPrendas: erp.totalPrendas,
            netoOperativo: erp.netoOperativo,
            hasMercadoPago: erp.hasMercadoPago,
          }
        : null,
    },
  };
}
