"use client";

import { CheckCircle2, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatRemitosCurrency } from "@/lib/erp/remitos-kpis";
import { cn } from "@/lib/utils";
import type { V2FinancialAccountRow } from "@/types/erp-v2-financial-accounts";

type Props = {
  accounts: V2FinancialAccountRow[];
  onEdit: (account: V2FinancialAccountRow) => void;
  onActivate: (account: V2FinancialAccountRow) => void;
  busyId?: string | null;
};

export function ErpFinancialAccountsTable({
  accounts,
  onEdit,
  onActivate,
  busyId,
}: Props) {
  if (accounts.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-[hsl(var(--erp-fg-muted))]">
        No hay cuentas financieras. Creá la primera con el botón &quot;Nueva cuenta&quot;.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead>
          <tr className="border-b border-[hsl(var(--erp-border))] text-[11px] uppercase tracking-wide text-[hsl(var(--erp-fg-subtle))]">
            <th className="px-3 py-2 font-medium">Nombre</th>
            <th className="px-3 py-2 font-medium text-right">Tasa %</th>
            <th className="px-3 py-2 font-medium text-right">Saldo</th>
            <th className="px-3 py-2 font-medium">Estado</th>
            <th className="px-3 py-2 font-medium text-right">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((account) => (
            <tr
              key={account.id}
              className={cn(
                "border-b border-[hsl(var(--erp-border)/0.5)] hover:bg-[hsl(var(--erp-bg-hover)/0.35)]",
                account.isActive && "bg-[hsl(var(--erp-accent-emerald)/0.04)]"
              )}
            >
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: account.color }}
                  />
                  <div>
                    <span className="font-medium text-[hsl(var(--erp-fg))]">
                      {account.name}
                    </span>
                    {account.displayName && (
                      <p className="text-[10px] text-[hsl(var(--erp-fg-muted))]">
                        {account.displayName}
                      </p>
                    )}
                  </div>
                </div>
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {account.ratePercent.toFixed(2)}%
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-[hsl(var(--erp-fg-muted))]">
                {formatRemitosCurrency(account.balanceMock)}
                <span className="ml-1 text-[10px]">mock</span>
              </td>
              <td className="px-3 py-2">
                {account.isActive ? (
                  <span className="inline-flex items-center gap-1 rounded bg-[hsl(var(--erp-accent-emerald)/0.12)] px-2 py-0.5 text-[11px] font-medium text-[hsl(var(--erp-accent-emerald))]">
                    <CheckCircle2 className="h-3 w-3" />
                    Cuenta Activa
                  </span>
                ) : (
                  <span className="inline-flex rounded px-2 py-0.5 text-[11px] font-medium bg-[hsl(var(--erp-fg-muted)/0.12)] text-[hsl(var(--erp-fg-muted))]">
                    Inactiva
                  </span>
                )}
              </td>
              <td className="px-3 py-2">
                <div className="flex justify-end gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busyId === account.id}
                    onClick={() => onEdit(account)}
                  >
                    <Pencil className="mr-1 h-3.5 w-3.5" />
                    Editar
                  </Button>
                  {!account.isActive && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busyId === account.id}
                      onClick={() => onActivate(account)}
                    >
                      Activar
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
