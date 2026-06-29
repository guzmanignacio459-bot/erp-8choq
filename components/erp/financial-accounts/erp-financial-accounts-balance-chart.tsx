import { formatRemitosCurrency } from "@/lib/erp/remitos-kpis";
import {
  accountsForBalanceChart,
  chartBarHeightPercent,
} from "@/lib/financial-accounts/balance-chart";
import type { V2FinancialAccountRow } from "@/types/erp-v2-financial-accounts";

type Props = {
  accounts: V2FinancialAccountRow[];
};

export function ErpFinancialAccountsBalanceChart({ accounts }: Props) {
  const sorted = accountsForBalanceChart(accounts);
  const maxBalance = Math.max(...sorted.map((a) => a.operatingBalance), 0);

  if (sorted.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-[hsl(var(--erp-fg-muted))]">
        Sin cuentas para mostrar saldos.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-[11px] uppercase tracking-wide text-[hsl(var(--erp-fg-subtle))]">
        Saldo Operativo por Cuenta
      </p>
      <div className="space-y-3">
        {sorted.map((account) => {
          const widthPct = chartBarHeightPercent(account.operatingBalance, maxBalance);

          return (
            <div key={account.id} className="grid grid-cols-[88px_1fr_auto] items-center gap-3">
              <span
                className="truncate text-[11px] font-medium text-[hsl(var(--erp-fg))]"
                title={account.name}
              >
                {account.name}
                {account.isActive && (
                  <span className="ml-1 text-[9px] text-[hsl(var(--erp-accent-emerald))]">
                    ●
                  </span>
                )}
              </span>
              <div className="relative h-7 overflow-hidden rounded-md bg-[hsl(var(--erp-bg-elevated))]">
                <div
                  className="absolute inset-y-0 left-0 rounded-md transition-all"
                  style={{
                    width: `${Math.max(widthPct, account.operatingBalance > 0 ? 2 : 0)}%`,
                    backgroundColor: account.color,
                    opacity: account.isActive ? 1 : 0.55,
                  }}
                  title={`${account.name}: ${formatRemitosCurrency(account.operatingBalance)} (fact. ${formatRemitosCurrency(account.billingTotal)} − TF ${formatRemitosCurrency(account.transferFeeTotal)})`}
                />
              </div>
              <span className="min-w-[72px] text-right text-[11px] tabular-nums text-[hsl(var(--erp-fg-muted))]">
                {formatRemitosCurrency(account.operatingBalance)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
