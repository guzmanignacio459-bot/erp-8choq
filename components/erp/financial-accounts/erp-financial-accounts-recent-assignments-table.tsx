import type { V2FinancialAccountAssignmentRow } from "@/types/erp-v2-financial-account-assignments";

type Props = {
  rows: V2FinancialAccountAssignmentRow[];
};

const SOURCE_LABEL: Record<string, string> = {
  MANUAL: "Manual",
  PERIOD: "Período",
  DEFAULT: "Default",
};

export function ErpFinancialAccountsRecentAssignmentsTable({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-[hsl(var(--erp-fg-muted))]">
        Sin asignaciones registradas aún.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-[hsl(var(--erp-border))] text-[11px] uppercase tracking-wide text-[hsl(var(--erp-fg-subtle))]">
            <th className="px-3 py-2 font-medium">Fecha</th>
            <th className="px-3 py-2 font-medium">Orden</th>
            <th className="px-3 py-2 font-medium">Cuenta</th>
            <th className="px-3 py-2 font-medium">Tasa %</th>
            <th className="px-3 py-2 font-medium">Fuente</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className="border-b border-[hsl(var(--erp-border)/0.5)] hover:bg-[hsl(var(--erp-bg-hover)/0.35)]"
            >
              <td className="px-3 py-2 text-[hsl(var(--erp-fg-muted))]">
                {new Date(row.assignedAt).toLocaleString("es-AR")}
              </td>
              <td className="px-3 py-2 font-mono text-xs">{row.originId}</td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: row.accountColor }}
                  />
                  {row.accountName}
                </div>
              </td>
              <td className="px-3 py-2 tabular-nums">
                {row.ratePercentSnapshot.toFixed(2)}%
              </td>
              <td className="px-3 py-2">
                {SOURCE_LABEL[row.assignmentSource] ?? row.assignmentSource}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
