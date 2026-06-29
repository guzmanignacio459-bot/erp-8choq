import type { V2FinancialAccountRow } from "@/types/erp-v2-financial-accounts";

/** Todas las cuentas para el gráfico de saldos (sin filtrar por isActive). */
export function accountsForBalanceChart(
  accounts: V2FinancialAccountRow[]
): V2FinancialAccountRow[] {
  return [...accounts].sort((a, b) => b.balanceMock - a.balanceMock);
}

export function chartBarHeightPercent(
  balance: number,
  maxBalance: number
): number {
  if (maxBalance <= 0 || balance <= 0) return 0;
  return (balance / maxBalance) * 100;
}
