/**
 * M6.3.3 — Health: órdenes MP pagadas sin fila en payments
 */

import { getPrisma } from "@/lib/db/prisma";
import type { HealthCheckStatus } from "@/types/erp-v2-pipeline-health";

export const PAYMENTS_PENDING_FAIL_HOURS = 6;

export type PaymentsPendingSnapshot = {
  count: number;
  status: HealthCheckStatus;
  oldestOrderId: string | null;
  oldestPaidAt: string | null;
  lagHours: number | null;
  message: string;
};

function resolveStatus(
  count: number,
  lagHours: number | null
): HealthCheckStatus {
  if (count === 0) return "PASS";
  if (lagHours != null && lagHours >= PAYMENTS_PENDING_FAIL_HOURS) return "FAIL";
  return "WARNING";
}

export async function getPaymentsPendingSnapshot(): Promise<PaymentsPendingSnapshot> {
  const prisma = getPrisma();
  const rows = await prisma.$queryRaw<
    Array<{ id: string; tn_paid_at: Date }>
  >`
    SELECT o.id, o.tn_paid_at
    FROM tn_orders o
    WHERE o.tn_paid_at IS NOT NULL
      AND LOWER(COALESCE(o.payment_gateway, '')) = 'mercado-pago'
      AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.tn_order_id = o.id)
    ORDER BY o.tn_paid_at ASC
    LIMIT 1
  `;

  const countRows = await prisma.$queryRaw<[{ count: number }]>`
    SELECT COUNT(*)::int AS count
    FROM tn_orders o
    WHERE o.tn_paid_at IS NOT NULL
      AND LOWER(COALESCE(o.payment_gateway, '')) = 'mercado-pago'
      AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.tn_order_id = o.id)
  `;

  const count = countRows[0]?.count ?? 0;
  const oldest = rows[0];
  const oldestPaidAt = oldest?.tn_paid_at ?? null;
  const lagHours =
    oldestPaidAt != null
      ? (Date.now() - oldestPaidAt.getTime()) / (1000 * 60 * 60)
      : null;

  const status = resolveStatus(count, lagHours);
  const lagLabel =
    lagHours != null ? `${lagHours.toFixed(1)}h` : "—";

  let message: string;
  if (count === 0) {
    message = "Todas las órdenes MP pagadas tienen payment sync";
  } else if (status === "FAIL") {
    message = `${count} órdenes MP sin payment (más antigua: ${oldest?.id ?? "?"}, ${lagLabel} atraso)`;
  } else {
    message = `${count} órdenes MP sin payment (< ${PAYMENTS_PENDING_FAIL_HOURS}h, en cola)`;
  }

  return {
    count,
    status,
    oldestOrderId: oldest?.id ?? null,
    oldestPaidAt: oldestPaidAt?.toISOString() ?? null,
    lagHours: lagHours != null ? Math.round(lagHours * 10) / 10 : null,
    message,
  };
}
