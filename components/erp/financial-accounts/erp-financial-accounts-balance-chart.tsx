import { formatRemitosCurrency } from "@/lib/erp/remitos-kpis";
import type { V2FinancialAccountRow } from "@/types/erp-v2-financial-accounts";

type Props = {
  accounts: V2FinancialAccountRow[];
};

export function ErpFinancialAccountsBalanceChart({ accounts }: Props) {
  const active = accounts.filter((a) => a.isActive);
  const maxBalance = Math.max(...active.map((a) => a.balanceMock), 1);

  if (active.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-[hsl(var(--erp-fg-muted))]">
        Sin cuentas activas para mostrar saldos.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-[11px] uppercase tracking-wide text-[hsl(var(--erp-fg-subtle))]">
        Saldo por cuenta
        <span className="ml-2 normal-case text-[hsl(var(--erp-fg-muted))]">
          (mock — ledger pendiente)
        </span>
      </p>
      <div className="flex h-56 items-end gap-3 border-b border-[hsl(var(--erp-border))] pb-2">
        {active.map((account) => {
          const heightPct = Math.max(8, (account.balanceMock / maxBalance) * 100);
          return (
            <div
              key={account.id}
              className="flex min-w-0 flex-1 flex-col items-center gap-2"
            >
              <span className="text-[10px] tabular-nums text-[hsl(var(--erp-fg-muted))]">
                {formatRemitosCurrency(account.balanceMock)}
              </span>
              <div
                className="w-full max-w-[72px] rounded-t-md transition-all"
                style={{
                  height: `${heightPct}%`,
                  backgroundColor: account.color,
                  opacity: 0.85,
                }}
                title={`${account.name}: ${formatRemitosCurrency(account.balanceMock)}`}
              />
              <span
                className="max-w-full truncate text-center text-[11px] text-[hsl(var(--erp-fg))]"
                title={account.name}
              >
                {account.name}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
