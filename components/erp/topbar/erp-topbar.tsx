"use client";

import Link from "next/link";
import {
  Bell,
  ChevronDown,
  ExternalLink,
  Menu,
  Search,
} from "lucide-react";

type ErpTopbarProps = {
  periodo: string;
  onMenuClick: () => void;
};

export function ErpTopbar({ periodo, onMenuClick }: ErpTopbarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-[var(--erp-topbar-h)] items-center gap-4 border-b border-[hsl(var(--erp-border-subtle))] bg-[hsl(var(--erp-bg)/0.8)] px-4 backdrop-blur-xl sm:px-6 lg:px-8">
      <button
        type="button"
        onClick={onMenuClick}
        className="rounded-lg border border-[hsl(var(--erp-border))] bg-[hsl(var(--erp-bg-card))] p-2 text-[hsl(var(--erp-fg-muted))] hover:text-[hsl(var(--erp-fg))] lg:hidden"
        aria-label="Abrir menú"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="hidden min-w-0 flex-1 sm:block">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--erp-fg-subtle))]" />
          <input
            type="search"
            placeholder="Buscar órdenes, remitos, SKUs…"
            disabled
            className="h-10 w-full rounded-lg border border-[hsl(var(--erp-border))] bg-[hsl(var(--erp-bg-card))] pl-10 pr-4 text-sm text-[hsl(var(--erp-fg))] placeholder:text-[hsl(var(--erp-fg-subtle))] opacity-70 cursor-not-allowed"
            aria-label="Búsqueda (próximamente)"
          />
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <button
          type="button"
          disabled
          className="hidden items-center gap-2 rounded-lg border border-[hsl(var(--erp-border))] bg-[hsl(var(--erp-bg-card))] px-3 py-2 text-sm text-[hsl(var(--erp-fg-muted))] sm:flex opacity-70 cursor-not-allowed"
        >
          <span>{periodo}</span>
          <ChevronDown className="h-4 w-4" />
        </button>

        <button
          type="button"
          className="relative rounded-lg border border-[hsl(var(--erp-border))] bg-[hsl(var(--erp-bg-card))] p-2 text-[hsl(var(--erp-fg-muted))] hover:text-[hsl(var(--erp-fg))]"
          aria-label="Notificaciones"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[hsl(var(--erp-accent))]" />
        </button>

        <Link
          href="/remitos"
          className="hidden items-center gap-1.5 rounded-lg border border-[hsl(var(--erp-border))] bg-[hsl(var(--erp-bg-card))] px-3 py-2 text-xs font-medium text-[hsl(var(--erp-fg-muted))] transition-colors hover:border-[hsl(var(--erp-accent)/0.3)] hover:text-[hsl(var(--erp-fg))] sm:inline-flex"
        >
          Remitos
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>

        <div className="flex items-center gap-2 rounded-lg border border-[hsl(var(--erp-border))] bg-[hsl(var(--erp-bg-card))] py-1.5 pl-1.5 pr-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-violet-500/30 to-cyan-500/20 text-xs font-semibold text-[hsl(var(--erp-fg))]">
            8Q
          </div>
          <div className="hidden text-left sm:block">
            <p className="text-xs font-medium leading-none text-[hsl(var(--erp-fg))]">
              Admin
            </p>
            <p className="mt-0.5 text-[10px] text-[hsl(var(--erp-fg-subtle))]">
              Fase 1
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}
