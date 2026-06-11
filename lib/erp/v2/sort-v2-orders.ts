import type { V2CommercialOrder } from "@/types/erp-v2-api";

export function sortV2OrdersByTnDateDesc(
  orders: V2CommercialOrder[]
): V2CommercialOrder[] {
  return [...orders].sort((a, b) => {
    const ta = a.tnCreatedAt ? Date.parse(a.tnCreatedAt) : 0;
    const tb = b.tnCreatedAt ? Date.parse(b.tnCreatedAt) : 0;
    if (tb !== ta) return tb - ta;
    return b.tnOrderId.localeCompare(a.tnOrderId);
  });
}
