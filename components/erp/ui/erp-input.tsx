import * as React from "react";
import { Search } from "lucide-react";

import { cn } from "@/lib/utils";

export type ErpInputProps = React.ComponentProps<"input"> & {
  inputSize?: "sm" | "default";
  error?: boolean;
};

export const ErpInput = React.forwardRef<HTMLInputElement, ErpInputProps>(
  ({ className, type, inputSize = "default", error, ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        className={cn(
          "flex w-full rounded-erp-md border bg-erp-bg-card px-3 font-sans text-sm text-erp-fg shadow-sm transition-colors duration-normal ease-erp",
          "placeholder:text-erp-fg-subtle",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-erp-accent/35 focus-visible:border-erp-accent/50",
          "disabled:cursor-not-allowed disabled:opacity-50",
          inputSize === "sm" ? "h-9 text-xs" : "h-10",
          error
            ? "border-erp-danger/50 focus-visible:ring-erp-danger/35"
            : "border-erp-border",
          className
        )}
        {...props}
      />
    );
  }
);
ErpInput.displayName = "ErpInput";

export type ErpSearchInputProps = Omit<ErpInputProps, "type">;

export const ErpSearchInput = React.forwardRef<
  HTMLInputElement,
  ErpSearchInputProps
>(({ className, ...props }, ref) => {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-erp-fg-subtle" />
      <ErpInput ref={ref} type="search" className="pl-10" {...props} />
    </div>
  );
});
ErpSearchInput.displayName = "ErpSearchInput";

export type ErpLabelProps = React.LabelHTMLAttributes<HTMLLabelElement>;

export function ErpLabel({ className, ...props }: ErpLabelProps) {
  return (
    <label
      className={cn(
        "mb-1.5 block text-label uppercase text-erp-fg-subtle",
        className
      )}
      {...props}
    />
  );
}
