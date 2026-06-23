import {
  ArrowDownRight,
  ArrowUpRight,
  Minus,
  TrendingUp,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { ErpKpiCard } from "@/types/erp";

const ACCENT_CLASS: Record<ErpKpiCard["accent"], string> = {
  violet: "erp-kpi-accent-violet",
  cyan: "erp-kpi-accent-cyan",
  emerald: "erp-kpi-accent-emerald",
  amber: "erp-kpi-accent-amber",
  rose: "erp-kpi-accent-rose",
  blue: "erp-kpi-accent-blue",
  orange: "erp-kpi-accent-orange",
  pink: "erp-kpi-accent-pink",
};

type KpiCardProps = {
  kpi: ErpKpiCard;
};

export function KpiCard({ kpi }: KpiCardProps) {
  const TrendIcon =
    kpi.trend === "up"
      ? ArrowUpRight
      : kpi.trend === "down"
        ? ArrowDownRight
        : Minus;

  const trendColor =
    kpi.trend === "up"
      ? "text-[hsl(var(--erp-emerald))]"
      : kpi.trend === "down"
        ? "text-[hsl(38_92%_50%)]"
        : "text-[hsl(var(--erp-fg-subtle))]";

  return (
    <article
      className={cn(
        "erp-card erp-card-glow group relative p-5 transition-transform duration-200 hover:-translate-y-0.5",
        ACCENT_CLASS[kpi.accent]
      )}
    >
      <div
        className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-20 blur-2xl transition-opacity group-hover:opacity-30"
        style={{ background: "hsl(var(--kpi-accent))" }}
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wider text-[hsl(var(--erp-fg-muted))]">
            {kpi.label}
          </p>
          <p className="mt-2 truncate text-2xl font-semibold tracking-tight text-[hsl(var(--erp-fg))] sm:text-[1.65rem]">
            {kpi.value}
          </p>
        </div>
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[hsl(var(--erp-border))]"
          style={{
            background: "hsl(var(--kpi-accent) / 0.12)",
            color: "hsl(var(--kpi-accent))",
          }}
        >
          <TrendingUp className="h-4 w-4" />
        </div>
      </div>

      <div className="relative mt-4 flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium",
            trendColor,
            "bg-[hsl(var(--erp-bg-hover))]"
          )}
        >
          <TrendIcon className="h-3.5 w-3.5" />
          {kpi.change}
        </span>
        <span className="text-[11px] text-[hsl(var(--erp-fg-subtle))]">
          vs período anterior
        </span>
      </div>

      <p className="relative mt-3 line-clamp-2 text-[11px] leading-relaxed text-[hsl(var(--erp-fg-muted))]">
        {kpi.hint}
      </p>
    </article>
  );
}
