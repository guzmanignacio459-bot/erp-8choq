import * as React from "react";

import { cn } from "@/lib/utils";

export function ErpTable({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableElement>) {
  return (
    <table
      className={cn("w-full caption-bottom text-sm", className)}
      {...props}
    />
  );
}

export function ErpTableScroll({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "erp-table-scroll-wrap erp-card overflow-hidden",
        className
      )}
      {...props}
    >
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

export function ErpTableHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn(
        "sticky top-0 z-10 border-b border-erp-border-subtle bg-erp-bg-elevated",
        className
      )}
      {...props}
    />
  );
}

export function ErpTableBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />
  );
}

export function ErpTableRow({
  className,
  selected,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement> & { selected?: boolean }) {
  return (
    <tr
      className={cn(
        "h-erp-row border-b border-erp-border-subtle transition-colors duration-fast",
        "hover:bg-erp-bg-hover",
        selected && "border-l-2 border-l-erp-accent bg-erp-accent/8",
        className
      )}
      {...props}
    />
  );
}

export function ErpTableHead({
  className,
  numeric,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <th
      className={cn(
        "px-4 py-3 text-left text-label uppercase text-erp-fg-subtle",
        numeric && "text-right",
        className
      )}
      {...props}
    />
  );
}

export function ErpTableCell({
  className,
  numeric,
  mono,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & {
  numeric?: boolean;
  mono?: boolean;
}) {
  return (
    <td
      className={cn(
        "px-4 py-2.5 text-sm text-erp-fg",
        numeric && "text-right font-mono tabular-nums",
        mono && "font-mono text-xs text-erp-fg-muted",
        className
      )}
      {...props}
    />
  );
}

export function ErpTableEmpty({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 px-6 py-12 text-center text-xs text-erp-fg-muted",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
