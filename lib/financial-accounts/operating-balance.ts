/**
 * M6.6.1 — Saldo operativo real por cuenta financiera
 *
 * Saldo Operativo = SUM(tn_orders.tn_total) - SUM(financial_items.transfer_fee_allocated)
 * Agrupado por financial_account_assignments.account_id
 */

import { roundMoney } from "@/lib/financial-items/compute-net-real";
import { getPrisma } from "@/lib/db/prisma";

export type AccountOperatingBalance = {
  accountId: string;
  billingTotal: number;
  transferFeeTotal: number;
  operatingBalance: number;
  orderCount: number;
};

type RawOperatingRow = {
  account_id: string;
  facturacion: number;
  transfer_fee: number;
  saldo_operativo: number;
  orders: number;
};

/** Una fila por orden asignada; evita duplicar tn_total al join con financial_items. */
const OPERATING_BALANCE_SQL = `
  WITH per_order AS (
    SELECT
      a.account_id,
      o.tn_total::float AS tn_total,
      COALESCE((
        SELECT SUM(fi.transfer_fee_allocated)::float
        FROM financial_items fi
        WHERE fi.origin_type = 'TN_ORDER' AND fi.origin_id = a.origin_id
      ), 0) AS transfer_fee
    FROM financial_account_assignments a
    INNER JOIN tn_orders o ON o.id = a.origin_id
    WHERE a.origin_type = 'TN_ORDER'
  )
  SELECT
    fa.id AS account_id,
    COALESCE(SUM(po.tn_total), 0)::float AS facturacion,
    COALESCE(SUM(po.transfer_fee), 0)::float AS transfer_fee,
    (COALESCE(SUM(po.tn_total), 0) - COALESCE(SUM(po.transfer_fee), 0))::float AS saldo_operativo,
    COUNT(po.tn_total)::int AS orders
  FROM financial_accounts fa
  LEFT JOIN per_order po ON po.account_id = fa.id
  GROUP BY fa.id
`;

export async function fetchOperatingBalancesByAccount(): Promise<
  Map<string, AccountOperatingBalance>
> {
  const prisma = getPrisma();
  const rows = await prisma.$queryRawUnsafe<RawOperatingRow[]>(
    OPERATING_BALANCE_SQL
  );

  const map = new Map<string, AccountOperatingBalance>();
  for (const row of rows) {
    map.set(row.account_id, {
      accountId: row.account_id,
      billingTotal: roundMoney(Number(row.facturacion)),
      transferFeeTotal: roundMoney(Number(row.transfer_fee)),
      operatingBalance: roundMoney(Number(row.saldo_operativo)),
      orderCount: Number(row.orders),
    });
  }
  return map;
}

export async function fetchOperatingBalanceForAccount(
  accountId: string
): Promise<AccountOperatingBalance> {
  const all = await fetchOperatingBalancesByAccount();
  return (
    all.get(accountId) ?? {
      accountId,
      billingTotal: 0,
      transferFeeTotal: 0,
      operatingBalance: 0,
      orderCount: 0,
    }
  );
}

export async function fetchOperatingBalanceTotals(): Promise<{
  billingTotal: number;
  transferFeeTotal: number;
  operatingBalanceTotal: number;
}> {
  const map = await fetchOperatingBalancesByAccount();
  let billingTotal = 0;
  let transferFeeTotal = 0;
  let operatingBalanceTotal = 0;
  for (const row of map.values()) {
    billingTotal += row.billingTotal;
    transferFeeTotal += row.transferFeeTotal;
    operatingBalanceTotal += row.operatingBalance;
  }
  return {
    billingTotal: roundMoney(billingTotal),
    transferFeeTotal: roundMoney(transferFeeTotal),
    operatingBalanceTotal: roundMoney(operatingBalanceTotal),
  };
}
