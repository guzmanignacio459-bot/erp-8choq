import { Database, Sheet } from "lucide-react";

import type { RemitosDataSource } from "@/types/erp-remitos-display";

type ErpRemitosSourceBadgeProps = {
  source: RemitosDataSource;
  detail?: string;
};

export function ErpRemitosSourceBadge({
  source,
  detail,
}: ErpRemitosSourceBadgeProps) {
  const isNeon = source === "neon";

  return (
    <div
      className={
        isNeon
          ? "inline-flex items-center gap-2 rounded-full border border-[hsl(var(--erp-accent)/0.45)] bg-[hsl(var(--erp-accent)/0.12)] px-3 py-1 text-[11px] font-medium text-[hsl(var(--erp-fg))]"
          : "inline-flex items-center gap-2 rounded-full border border-[hsl(var(--erp-border))] bg-[hsl(var(--erp-bg-card))] px-3 py-1 text-[11px] font-medium text-[hsl(var(--erp-fg-muted))]"
      }
    >
      <span
        className={
          isNeon
            ? "h-1.5 w-1.5 rounded-full bg-[hsl(var(--erp-accent))]"
            : "erp-live-dot h-1.5 w-1.5 rounded-full bg-[hsl(var(--erp-emerald))]"
        }
      />
      {isNeon ? (
        <Database className="h-3 w-3 text-[hsl(var(--erp-accent))]" />
      ) : (
        <Sheet className="h-3 w-3" />
      )}
      <span>{isNeon ? "Modo Neon staging (TN)" : "Modo GAS legacy"}</span>
      {detail ? (
        <span className="text-[hsl(var(--erp-fg-subtle))]">· {detail}</span>
      ) : null}
    </div>
  );
}
