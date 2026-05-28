import { cn } from "@/lib/utils";
import type { ErpRemitoItemOwner } from "@/types/erp";

type ErpRemitoItemsOwnerBadgeProps = {
  owner: ErpRemitoItemOwner;
  className?: string;
};

export function ErpRemitoItemsOwnerBadge({
  owner,
  className,
}: ErpRemitoItemsOwnerBadgeProps) {
  const isScnl = owner === "SCNL";

  return (
    <span
      className={cn(
        "inline-flex rounded-md border px-2 py-0.5 text-[10px] font-medium",
        isScnl
          ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-200"
          : "border-violet-500/30 bg-violet-500/10 text-violet-200",
        className
      )}
    >
      {owner}
    </span>
  );
}
