"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  Box,
  CreditCard,
  Download,
  FileText,
  Files,
  Layers,
  LayoutDashboard,
  ListTree,
  Package,
  Settings,
  ShoppingBag,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { ERP_NAV_SECTIONS } from "@/components/erp/sidebar/nav-config";

const ICON_MAP: Record<string, LucideIcon> = {
  activity: Activity,
  "layout-dashboard": LayoutDashboard,
  "shopping-bag": ShoppingBag,
  "trending-up": TrendingUp,
  "bar-chart-3": BarChart3,
  files: Files,
  "list-tree": ListTree,
  box: Box,
  package: Package,
  "file-text": FileText,
  layers: Layers,
  "credit-card": CreditCard,
  download: Download,
  users: Users,
  settings: Settings,
};

type ErpSidebarPanelProps = {
  onClose: () => void;
};

/** Panel lateral — instancia propia por mount (evita keys duplicadas desktop/mobile) */
function ErpSidebarPanel({ onClose }: ErpSidebarPanelProps) {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-[var(--erp-sidebar-w)] flex-col border-r border-[hsl(var(--erp-border))] bg-[hsl(var(--erp-bg-elevated)/0.95)] backdrop-blur-xl">
      <div className="flex h-[var(--erp-topbar-h)] shrink-0 items-center gap-3 border-b border-[hsl(var(--erp-border-subtle))] px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-erp-accent to-erp-accent-dim text-sm font-bold text-erp-bg shadow-lg shadow-erp-accent/25">
          8Q
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold tracking-tight text-[hsl(var(--erp-fg))]">
            8CHOQ ERP
          </p>
          <p className="truncate text-[11px] text-[hsl(var(--erp-fg-muted))]">
            Finanzas · Ecommerce
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-[hsl(var(--erp-fg-muted))] hover:bg-[hsl(var(--erp-bg-hover))] hover:text-[hsl(var(--erp-fg))] lg:hidden"
          aria-label="Cerrar menú"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="erp-scrollbar flex-1 overflow-y-auto px-3 py-4">
        {ERP_NAV_SECTIONS.map((section) => (
          <div
            key={`${section.id}-${section.title}`}
            className="mb-6 last:mb-0"
          >
            <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-[hsl(var(--erp-fg-subtle))]">
              {section.title}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = ICON_MAP[item.icon] ?? LayoutDashboard;
                const isActive =
                  !item.comingSoon &&
                  (pathname === item.href ||
                    (item.href === "/dashboard"
                      ? pathname === "/dashboard"
                      : item.href !== "/remitos" &&
                        pathname.startsWith(item.href)));
                const isExternalOps = item.href === "/remitos";

                return (
                  <li key={`${section.title}-${item.href}`}>
                    {item.comingSoon ? (
                      <span
                        className={cn(
                          "relative flex cursor-not-allowed items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 text-sm text-[hsl(var(--erp-fg-subtle))]",
                          "opacity-60"
                        )}
                        title="Próximamente"
                      >
                        <Icon className="h-4 w-4 shrink-0 opacity-50" />
                        <span className="flex-1 truncate">{item.label}</span>
                        <span className="rounded-md bg-[hsl(var(--erp-bg-hover))] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-[hsl(var(--erp-fg-subtle))]">
                          Soon
                        </span>
                      </span>
                    ) : (
                      <Link
                        href={item.href}
                        onClick={onClose}
                        className={cn(
                          "relative flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors",
                          isActive
                            ? "erp-nav-active border-[hsl(var(--erp-accent)/0.25)] font-medium text-[hsl(var(--erp-fg))]"
                            : "border-transparent text-[hsl(var(--erp-fg-muted))] hover:border-[hsl(var(--erp-border))] hover:bg-[hsl(var(--erp-bg-hover))] hover:text-[hsl(var(--erp-fg))]"
                        )}
                      >
                        <Icon
                          className={cn(
                            "h-4 w-4 shrink-0",
                            isActive && "text-[hsl(var(--erp-accent))]"
                          )}
                        />
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.badge && (
                          <span className="erp-badge">{item.badge}</span>
                        )}
                        {isExternalOps && (
                          <span className="text-[10px] text-[hsl(var(--erp-fg-subtle))]">
                            ↗
                          </span>
                        )}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-[hsl(var(--erp-border-subtle))] p-4">
        <div className="erp-card rounded-lg p-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="erp-live-dot h-2 w-2 rounded-full bg-[hsl(var(--erp-emerald))]" />
            <span className="text-xs font-medium text-[hsl(var(--erp-fg))]">
              Sistema operativo
            </span>
          </div>
          <p className="text-[11px] leading-relaxed text-[hsl(var(--erp-fg-muted))]">
            Remitos en producción. Dashboard ERP — Fase 1.5 (placeholders).
          </p>
        </div>
      </div>
    </aside>
  );
}

type ErpSidebarProps = {
  open: boolean;
  onClose: () => void;
};

export function ErpSidebar({ open, onClose }: ErpSidebarProps) {
  return (
    <>
      <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:block">
        <ErpSidebarPanel onClose={onClose} />
      </div>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
            aria-label="Cerrar overlay"
          />
          <div className="absolute inset-y-0 left-0 shadow-2xl">
            <ErpSidebarPanel onClose={onClose} />
          </div>
        </div>
      )}
    </>
  );
}
