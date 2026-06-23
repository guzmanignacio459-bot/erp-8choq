import type { V2CommercialOrder } from "@/types/erp-v2-api";

export type TnOrdersCommercialKpis = {
  ventasTn: number;
  facturacionTn: number;
  ticketPromedioTn: number;
  conRemitoErp: number;
};

export function computeTnOrdersKpis(
  orders: V2CommercialOrder[]
): TnOrdersCommercialKpis {
  let facturacionTn = 0;
  let conRemitoErp = 0;

  for (const order of orders) {
    facturacionTn += order.tnTotal;
    if (order.erp?.erpOrderId) conRemitoErp += 1;
  }

  const ventasTn = orders.length;

  return {
    ventasTn,
    facturacionTn,
    ticketPromedioTn: ventasTn > 0 ? facturacionTn / ventasTn : 0,
    conRemitoErp,
  };
}
