import { Database } from "lucide-react";

type TnOrdersStagingBadgeProps = {
  detail?: string;
};

export function TnOrdersStagingBadge({ detail }: TnOrdersStagingBadgeProps) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--erp-accent)/0.45)] bg-[hsl(var(--erp-accent)/0.12)] px-3 py-1 text-[11px] font-medium text-[hsl(var(--erp-fg))]">
      <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--erp-accent))]" />
      <Database className="h-3 w-3 text-[hsl(var(--erp-accent))]" />
      <span>Neon staging · tn_orders</span>
      {detail ? (
        <span className="text-[hsl(var(--erp-fg-subtle))]">· {detail}</span>
      ) : null}
    </div>
  );
}
