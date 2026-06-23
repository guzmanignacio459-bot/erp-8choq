/**
 * M3.1a — TN-first MP link + denormalización tn_orders.mp_*
 */

/**
 * Denormaliza cabecera MP en tn_orders desde payments (1 pago por tn_order_id).
 * Si hay varios payments, usa el de mp_payment_id más reciente por updated_at.
 */
export async function denormTnMpHeaders(prisma, tnOrderIds) {
  const ids = [...new Set((tnOrderIds ?? []).filter(Boolean))];
  if (!ids.length) return { updated: 0 };

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

  return { updated };
}

export async function collectM3MpCoverage(prisma) {
  const [
    paymentsTotal,
    paymentsWithErp,
    paymentsWithTn,
    paymentsWithMpId,
    tnTotal,
    tnWithMpHeader,
    tnWithNetoMp,
    tnWithErp,
    tnWithPaymentChain,
    tnWithoutPayment,
    paymentsOrphanTnLink,
  ] = await Promise.all([
    prisma.payment.count(),
    prisma.payment.count({ where: { erpOrderId: { not: null } } }),
    prisma.payment.count({ where: { tnOrderId: { not: null } } }),
    prisma.payment.count({ where: { mpPaymentId: { not: null } } }),
    prisma.tnOrder.count(),
    prisma.tnOrder.count({ where: { mpPaymentId: { not: null } } }),
    prisma.tnOrder.count({ where: { netoMpOrden: { not: null } } }),
    prisma.tnOrder.count({ where: { erpOrder: { isNot: null } } }),
    prisma.tnOrder.count({
      where: { payments: { some: {} } },
    }),
    prisma.tnOrder.count({
      where: { payments: { none: {} } },
    }),
    prisma.payment.count({
      where: {
        tnOrderId: { not: null },
        erpOrderId: null,
      },
    }),
  ]);

  const paymentsTnOnly = await prisma.payment.count({
    where: { tnOrderId: { not: null }, erpOrder: { is: null } },
  });

  const erpLinkedMissingTnOnPayment = await prisma.payment.count({
    where: {
      erpOrderId: { not: null },
      tnOrderId: null,
      erpOrder: { tnOrderId: { not: null } },
    },
  });

  return {
    generatedAt: new Date().toISOString(),
    payments: {
      total: paymentsTotal,
      withErpOrderId: paymentsWithErp,
      withTnOrderId: paymentsWithTn,
      withMpPaymentId: paymentsWithMpId,
      tnOnlyNoErp: paymentsTnOnly,
      erpWithTnButPaymentMissingTnLink: erpLinkedMissingTnOnPayment,
    },
    tnOrders: {
      total: tnTotal,
      withMpPaymentId: tnWithMpHeader,
      withNetoMpOrden: tnWithNetoMp,
      withErpOrder: tnWithErp,
      withPaymentRow: tnWithPaymentChain,
      withoutPaymentRow: tnWithoutPayment,
    },
  };
}
