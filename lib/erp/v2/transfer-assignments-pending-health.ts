/**
 * M6.5.1 — Health: transferencias TN sin financial account assignment
 */

import { getPrisma } from "@/lib/db/prisma";
import type { HealthCheckStatus } from "@/types/erp-v2-pipeline-health";

export const TRANSFER_ASSIGNMENTS_FAIL_HOURS = 6;

export type TransferAssignmentsPendingSnapshot = {
  count: number;
  status: HealthCheckStatus;
  oldestOrderId: string | null;
  oldestPaidAt: string | null;
  lagHours: number | null;
  message: string;
};

const TRANSFER_UNASSIGNED_WHERE = `
  o.tn_paid_at IS NOT NULL
  AND LOWER(COALESCE(o.payment_gateway, '')) NOT IN ('mercado-pago', 'mercadopago')
  AND NOT (LOWER(COALESCE(o.raw_tn_payload->>'gateway', '')) LIKE '%mercado%')
  AND (
    UPPER(TRIM(COALESCE(o.payment_method, ''))) = 'TRANSFERENCIA'
    OR LOWER(COALESCE(o.raw_tn_payload->>'gateway_name', '')) LIKE '%transfer%'
    OR LOWER(COALESCE(o.raw_tn_payload->>'gateway_name', '')) LIKE '%transferencia%'
    OR LOWER(COALESCE(o.raw_tn_payload->>'gateway_name', '')) LIKE '%depósito%'
    OR LOWER(COALESCE(o.raw_tn_payload->>'gateway_name', '')) LIKE '%deposito%'
    OR LOWER(COALESCE(o.raw_tn_payload->>'gateway_name', '')) LIKE '%bancario%'
  )
  AND NOT EXISTS (
    SELECT 1 FROM financial_account_assignments a
    WHERE a.origin_type = 'TN_ORDER' AND a.origin_id = o.id
  )
`;

function resolveStatus(
  count: number,
  lagHours: number | null
): HealthCheckStatus {
  if (count === 0) return "PASS";
  if (lagHours != null && lagHours >= TRANSFER_ASSIGNMENTS_FAIL_HOURS) {
    return "FAIL";
  }
  return "WARNING";
}

export async function getTransferAssignmentsPendingSnapshot(): Promise<TransferAssignmentsPendingSnapshot> {
  const prisma = getPrisma();

  const countRows = await prisma.$queryRawUnsafe<[{ count: number }]>(
    `SELECT COUNT(*)::int AS count FROM tn_orders o WHERE ${TRANSFER_UNASSIGNED_WHERE}`
  );

  const oldestRows = await prisma.$queryRawUnsafe<
    Array<{ id: string; tn_paid_at: Date }>
  >(
    `SELECT o.id, o.tn_paid_at FROM tn_orders o WHERE ${TRANSFER_UNASSIGNED_WHERE} ORDER BY o.tn_paid_at ASC LIMIT 1`
  );

  const count = countRows[0]?.count ?? 0;
  const oldest = oldestRows[0];
  const oldestPaidAt = oldest?.tn_paid_at ?? null;
  const lagHours =
    oldestPaidAt != null
      ? (Date.now() - oldestPaidAt.getTime()) / (1000 * 60 * 60)
      : null;

  const status = resolveStatus(count, lagHours);
  const lagLabel = lagHours != null ? `${lagHours.toFixed(1)}h` : "—";

  let message: string;
  if (count === 0) {
    message = "Todas las transferencias TN tienen cuenta financiera asignada";
  } else if (status === "FAIL") {
    message = `${count} transferencias sin assignment (más antigua: ${oldest?.id ?? "?"}, ${lagLabel} atraso)`;
  } else {
    message = `${count} transferencias sin assignment (< ${TRANSFER_ASSIGNMENTS_FAIL_HOURS}h, en cola)`;
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
