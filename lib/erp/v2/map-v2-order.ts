import { formatInstantArt } from "@/lib/erp/art-date";
import { deriveTnCommercialStatus } from "@/lib/erp/v2/tn-commercial-status";
import { decimalToNumber, decimalToNumberOrNull } from "@/lib/erp/v2/decimal";
import type { V2CommercialOrder, V2ErpOrderEnrichment } from "@/types/erp-v2-api";
import type { ErpOrder, Payment, TnOrder } from "@prisma/client";

type TnWithErp = TnOrder & {
  erpOrder: (ErpOrder & { payments: Payment[] }) | null;
};

function erpHasMercadoPago(
  erp: ErpOrder,
  payments: Payment[]
): boolean {
  if (
    payments.some(
      (p) =>
        Boolean(p.mpPaymentId?.trim()) ||
        (p.mpNetoRealOrden != null && Number(p.mpNetoRealOrden) > 0)
    )
  ) {
    return true;
  }
  if (erp.netoOperativo != null && Number(erp.netoOperativo) > 0) {
    return true;
  }
  const mp = (erp.metodoPago ?? "").toLowerCase();
  return mp.includes("mercado") || /\bmp\b/.test(mp);
}

function iso(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString();
}

function mapErpEnrichment(
  erp: ErpOrder & { payments?: Payment[] }
): V2ErpOrderEnrichment {
  const payments = erp.payments ?? [];
  return {
    erpOrderId: erp.id,
    fechaErp: iso(erp.fechaErp),
    totalFinalErp: decimalToNumber(erp.totalFinalErp),
    netoOperativo: decimalToNumberOrNull(erp.netoOperativo),
    processingStatus: erp.processingStatus,
    reconciliationStatus: erp.reconciliationStatus,
    reconciliationNote: erp.reconciliationNote,
    estadoOperativo: erp.estado,
    nombre: erp.nombre,
    metodoPago: erp.metodoPago,
    transporte: erp.transporte,
    totalPrendas: erp.totalPrendas ?? 0,
    hasMercadoPago: erpHasMercadoPago(erp, payments),
  };
}

export function mapTnRowToV2CommercialOrder(row: TnWithErp): V2CommercialOrder {
  const flags = (row.tnReportingFlags ?? null) as Record<string, unknown> | null;
  const raw = (row.rawTnPayload ?? null) as Record<string, unknown> | null;

  return {
    tnOrderId: row.id,
    commercialStatus: deriveTnCommercialStatus({
      tnStatus: row.tnStatus,
      tnPaymentStatus: row.tnPaymentStatus,
      tnReportingFlags: flags,
      rawTnPayload: raw,
    }),
    tnStatus: row.tnStatus,
    tnPaymentStatus: row.tnPaymentStatus,
    tnTotal: decimalToNumber(row.tnTotal),
    tnSubtotal: decimalToNumberOrNull(row.tnSubtotal),
    tnShipping: decimalToNumberOrNull(row.tnShipping),
    tnDiscount: decimalToNumberOrNull(row.tnDiscount),
    tnCreatedAt: iso(row.tnCreatedAt),
    tnPaidAt: iso(row.tnPaidAt),
    tnAnalyticsCounted: row.tnAnalyticsCounted,
    tnReportingFlags: flags,
    customerName: row.customerName,
    customerDni: row.customerDni,
    customerPhone: row.customerPhone,
    provinceLocalidad: row.provinceLocalidad,
    paymentGateway: row.paymentGateway,
    paymentMethod: row.paymentMethod,
    shippingOption: row.shippingOption,
    shippingOwner: row.shippingOwner,
    erp: row.erpOrder ? mapErpEnrichment(row.erpOrder) : null,
  };
}

export function formatV2RemitoFechaDisplay(isoDate: string | null): string {
  if (!isoDate) return "";
  return formatInstantArt(isoDate);
}
