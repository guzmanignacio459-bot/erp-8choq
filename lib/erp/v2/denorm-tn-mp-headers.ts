import { getPrisma } from "@/lib/db/prisma";

/**
 * Denormaliza cabecera MP en tn_orders desde payments (M3.1a/M3.1b).
 */
export async function denormTnMpHeaders(tnOrderIds: string[]): Promise<number> {
  const ids = [...new Set(tnOrderIds.filter(Boolean))];
  if (!ids.length) return 0;

  const prisma = getPrisma();
  let updated = 0;

  for (const tnOrderId of ids) {
    const payment = await prisma.payment.findFirst({
      where: { tnOrderId },
      orderBy: { updatedAt: "desc" },
    });
    if (!payment) continue;

    await prisma.tnOrder.update({
      where: { id: tnOrderId },
      data: {
        mpPaymentId: payment.mpPaymentId,
        netoMpOrden: payment.mpNetoRealOrden,
        mpFeeTotal: payment.mpFeeTotalReal,
        mpCostTotal: payment.mpTotalCostReal,
      },
    });
    updated++;
  }

  return updated;
}
