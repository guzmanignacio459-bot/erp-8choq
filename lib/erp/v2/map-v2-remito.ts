import {
  formatV2RemitoFechaDisplay,
} from "@/lib/erp/v2/map-v2-order";
import { deriveTnCommercialStatus } from "@/lib/erp/v2/tn-commercial-status";
import { decimalToNumber } from "@/lib/erp/v2/decimal";
import type { V2RemitoOperational } from "@/types/erp-v2-api";
import type { ErpOrder, TnOrder } from "@prisma/client";

type ErpWithTn = ErpOrder & { tnOrder: TnOrder | null };

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function moneyStr(v: Parameters<typeof decimalToNumber>[0]): string {
  const n = decimalToNumber(v);
  return n.toFixed(2);
}

export function mapErpRowToV2Remito(row: ErpWithTn): V2RemitoOperational {
  const fechaIso = row.fechaErp?.toISOString() ?? "";
  const tn = row.tnOrder;

  let commercialStatus = null as V2RemitoOperational["commercialStatus"];
  if (tn) {
    commercialStatus = deriveTnCommercialStatus({
      tnStatus: tn.tnStatus,
      tnPaymentStatus: tn.tnPaymentStatus,
      tnReportingFlags: (tn.tnReportingFlags ?? null) as Record<
        string,
        unknown
      > | null,
      rawTnPayload: (tn.rawTnPayload ?? null) as Record<string, unknown> | null,
    });
  }

  return {
    idRemito: row.id,
    fechaRaw: fechaIso,
    fechaDisplay: formatV2RemitoFechaDisplay(fechaIso),
    nombre: row.nombre,
    dni: str(row.dni),
    provinciaLocalidad: str(row.provinciaLocalidad),
    telefono: str(row.telefono),
    transporte: str(row.transporte),
    metodoDePago: str(row.metodoPago),
    vendedor: str(row.vendedor),
    condicionCompra: str(row.condicionCompra),
    totalPrendas: str(row.totalPrendas),
    subtotal: moneyStr(row.subtotalErp),
    shippingCustomerCost: moneyStr(row.shippingCustomerCost),
    envioOwner: str(row.envioOwner),
    shippingOwnerCost: moneyStr(row.shippingOwnerCost),
    recargoDescuento: moneyStr(row.recargoDescuento),
    totalFinal: moneyStr(row.totalFinalErp),
    estadoOperativo: str(row.estado),
    tnOrderId: str(row.tnOrderId),
    commercialStatus,
    reconciliationStatus: row.reconciliationStatus,
    processingStatus: row.processingStatus,
  };
}
