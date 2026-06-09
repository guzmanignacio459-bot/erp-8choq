import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const erpBadgeVariants = cva(
  "inline-flex items-center gap-1 rounded-erp-sm border px-1.5 py-0.5 text-micro font-semibold uppercase tracking-wide",
  {
    variants: {
      variant: {
        default:
          "border-erp-accent/20 bg-erp-accent/15 text-erp-accent",
        paid:
          "border-erp-success/25 bg-erp-success/15 text-erp-success",
        pending:
          "border-erp-warning/25 bg-erp-warning/15 text-erp-warning",
        cancelled:
          "border-erp-danger/20 bg-erp-danger/10 text-erp-danger",
        info:
          "border-erp-info/25 bg-erp-info/12 text-erp-info",
        mp:
          "border-erp-finance/25 bg-erp-finance/12 text-erp-finance",
        owner8q:
          "border-erp-accent/25 bg-erp-accent/12 text-erp-accent",
        ownerScnl:
          "border-erp-scnl/25 bg-erp-scnl/12 text-erp-scnl",
        outline:
          "border-erp-border bg-transparent text-erp-fg-muted",
        soon:
          "border-erp-border bg-erp-bg-hover text-erp-fg-subtle normal-case tracking-normal",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export type ErpBadgeProps = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof erpBadgeVariants>;

export function ErpBadge({ className, variant, ...props }: ErpBadgeProps) {
  return (
    <span className={cn(erpBadgeVariants({ variant }), className)} {...props} />
  );
}

export { erpBadgeVariants };
