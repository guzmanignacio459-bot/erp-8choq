import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const erpButtonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-erp-md text-sm font-semibold transition-colors duration-normal ease-erp focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-erp-accent/40 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-erp-accent text-erp-bg shadow-sm hover:bg-erp-accent/90 active:bg-erp-accent-dim",
        secondary:
          "border border-erp-border bg-erp-bg-card text-erp-fg hover:bg-erp-bg-hover hover:border-erp-border",
        ghost:
          "text-erp-fg-muted hover:bg-erp-bg-hover hover:text-erp-fg",
        danger:
          "border border-erp-danger/30 bg-erp-danger/15 text-erp-danger hover:bg-erp-danger/20",
        outline:
          "border border-erp-border bg-transparent text-erp-fg hover:bg-erp-bg-hover",
      },
      size: {
        sm: "h-9 px-3 text-xs",
        default: "h-10 px-4",
        lg: "h-11 px-6",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
);

export type ErpButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof erpButtonVariants> & {
    asChild?: boolean;
  };

export const ErpButton = React.forwardRef<HTMLButtonElement, ErpButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(erpButtonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
ErpButton.displayName = "ErpButton";

export { erpButtonVariants };
