import { reconciliationStatusLabel } from "@/lib/erp/v2/commercial-status-labels";
import { cn } from "@/lib/utils";
import type { ErpRemitoNeonMeta } from "@/types/erp-remitos-display";

type ErpRemitosReconciliationBadgeProps = {
  meta: ErpRemitoNeonMeta;
  compact?: boolean;
};

export function ErpRemitosReconciliationBadge({
  meta,
  compact = false,
}: ErpRemitosReconciliationBadgeProps) {
  const status = meta.reconciliationStatus;
  const label = reconciliationStatusLabel(status);

  let className =
    "inline-flex max-w-full truncate rounded-md border px-2 py-0.5 text-[10px] font-medium ";

  if (meta.tnOnlyPendingErp || status === "tn_only_pending_erp") {
    className += "border-amber-500/35 bg-amber-500/10 text-amber-200";
  } else if (status === "aligned") {
    className += "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  } else if (status === "mismatch_amount") {
    className += "border-rose-500/30 bg-rose-500/10 text-rose-300";
  } else if (status === "erp_only_not_in_panel") {
    className += "border-violet-500/30 bg-violet-500/10 text-violet-200";
  } else {
    className +=
      "border-[hsl(var(--erp-border))] bg-[hsl(var(--erp-bg-hover))] text-[hsl(var(--erp-fg-muted))]";
  }

  return (
    <span className={cn("flex flex-wrap items-center gap-1", compact && "gap-0.5")}>
      <span className={className} title={label}>
        {label}
      </span>
      {!meta.hasErpRemito && (
        <span className="inline-flex rounded-md border border-amber-500/25 bg-amber-500/5 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-200/90">
          Sin remito ERP
        </span>
      )}
    </span>
  );
}
