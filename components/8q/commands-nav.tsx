"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/8q/finanzas", label: "Finanzas" },
  { href: "/8q/ventas", label: "Ventas" },
  { href: "/8q/productos", label: "Productos y costos" },
  { href: "/8q/stock", label: "Stock" },
  { href: "/8q/envios", label: "Envíos" },
  { href: "/8q/integraciones", label: "Integraciones" },
  { href: "/8q/remitos", label: "Remitos" },
] as const;

export function CommandsNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="8Q COMMANDS" className="border-b border-erp-border">
      <div className="mx-auto flex w-full max-w-6xl gap-2 overflow-x-auto px-4 py-3">
        {TABS.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`shrink-0 rounded-erp-md px-3 py-2 text-sm ${
                active
                  ? "bg-erp-accent text-erp-bg"
                  : "text-erp-fg-muted hover:bg-erp-bg-hover hover:text-erp-fg"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
