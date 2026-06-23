import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const erpCardVariants = cva("rounded-erp border text-erp-fg", {
  variants: {
    variant: {
      default: "erp-card bg-erp-bg-card/85",
      elevated: "border-erp-border-subtle bg-erp-bg-elevated shadow-erp-card",
      inset: "border-erp-border-subtle bg-erp-bg-elevated",
      glow: "erp-card erp-card-glow bg-erp-bg-card/85",
      interactive:
        "erp-card cursor-pointer bg-erp-bg-card/85 transition-colors duration-normal hover:bg-erp-bg-hover",
    },
    padding: {
      none: "",
      sm: "p-4",
      default: "p-5",
      lg: "p-6",
    },
  },
  defaultVariants: {
    variant: "default",
    padding: "default",
  },
});

export type ErpCardProps = React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof erpCardVariants>;

export function ErpCard({
  className,
  variant,
  padding,
  ...props
}: ErpCardProps) {
  return (
    <div
      className={cn(erpCardVariants({ variant, padding }), className)}
      {...props}
    />
  );
}

export function ErpCardHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-col gap-1 border-b border-erp-border-subtle pb-4", className)}
      {...props}
    />
  );
}

export function ErpCardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn("text-sm font-semibold tracking-tight text-erp-fg", className)}
      {...props}
    />
  );
}

export function ErpCardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("text-xs text-erp-fg-muted", className)} {...props} />
  );
}

export function ErpCardContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("pt-4", className)} {...props} />;
}

export { erpCardVariants };
