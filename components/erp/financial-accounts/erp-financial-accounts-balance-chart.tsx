import { formatRemitosCurrency } from "@/lib/erp/remitos-kpis";
import type { V2FinancialAccountRow } from "@/types/erp-v2-financial-accounts";

type Props = {
  accounts: V2FinancialAccountRow[];
};

export function ErpFinancialAccountsBalanceChart({ accounts }: Props) {
  const sorted = [...accounts].sort((a, b) => b.balanceMock - a.balanceMock);
  const maxBalance = Math.max(...sorted.map((a) => a.balanceMock), 0);

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
        Saldo por cuenta
        <span className="ml-2 normal-case text-[hsl(var(--erp-fg-muted))]">
          (mock — altura proporcional al monto)
        </span>
      </p>
      <div className="flex h-56 items-end gap-3 border-b border-[hsl(var(--erp-border))] pb-2">
        {sorted.map((account) => {
          const heightPct =
            maxBalance > 0 ? (account.balanceMock / maxBalance) * 100 : 0;
          const barHeight = account.balanceMock > 0 ? Math.max(heightPct, 2) : 0;

          return (
            <div
              key={account.id}
              className="flex min-w-0 flex-1 flex-col items-center gap-2"
            >
              <span className="text-[10px] tabular-nums text-[hsl(var(--erp-fg-muted))]">
                {formatRemitosCurrency(account.balanceMock)}
              </span>
              <div className="flex h-44 w-full max-w-[80px] items-end justify-center">
                <div
                  className="w-full rounded-t-md transition-all"
                  style={{
                    height: `${barHeight}%`,
                    backgroundColor: account.color,
                    opacity: account.isActive ? 1 : 0.45,
                  }}
                  title={`${account.name}: ${formatRemitosCurrency(account.balanceMock)}`}
                />
              </div>
              <span
                className="max-w-full truncate text-center text-[11px] text-[hsl(var(--erp-fg))]"
                title={account.name}
              >
                {account.name}
                {account.isActive && (
                  <span className="ml-1 text-[9px] text-[hsl(var(--erp-accent-emerald))]">
                    ●
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
