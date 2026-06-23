"use client";

import { Loader2 } from "lucide-react";

type ErpDashboardLoadingProps = {
  label?: string;
  compact?: boolean;
};

export function ErpDashboardLoading({
  label = "Actualizando datos…",
  compact = false,
}: ErpDashboardLoadingProps) {
  return (
    <div
      className={
        compact
          ? "flex items-center justify-center gap-2 py-10"
          : "flex flex-col items-center justify-center gap-3 py-24"
      }
    >
      <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--erp-accent))]" />
      <p className="text-sm text-[hsl(var(--erp-fg-muted))]">{label}</p>
    </div>
  );
}
