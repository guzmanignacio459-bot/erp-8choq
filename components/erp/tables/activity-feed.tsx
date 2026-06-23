import { Activity, Download, FileText, Package, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { ErpActivityItem } from "@/types/erp";

const TYPE_META: Record<
  ErpActivityItem["tipo"],
  { icon: LucideIcon; color: string }
> = {
  import: { icon: Download, color: "text-violet-400 bg-violet-500/15" },
  remito: { icon: FileText, color: "text-cyan-400 bg-cyan-500/15" },
  stock: { icon: Package, color: "text-amber-400 bg-amber-500/15" },
  pago: { icon: Wallet, color: "text-emerald-400 bg-emerald-500/15" },
};

function formatRelative(iso: string) {
  try {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    const hours = Math.floor(diff / 3_600_000);
    if (hours < 1) return "Hace unos minutos";
    if (hours < 24) return `Hace ${hours}h`;
    return new Intl.DateTimeFormat("es-AR", {
      day: "numeric",
      month: "short",
    }).format(d);
  } catch {
    return iso;
  }
}

type ActivityFeedProps = {
  items: ErpActivityItem[];
};

export function ActivityFeed({ items }: ActivityFeedProps) {
  return (
    <div className="erp-card h-full">
      <div className="flex items-center gap-2 border-b border-[hsl(var(--erp-border-subtle))] px-5 py-4">
        <Activity className="h-4 w-4 text-[hsl(var(--erp-accent))]" />
        <div>
          <h2 className="text-sm font-semibold text-[hsl(var(--erp-fg))]">
            Actividad reciente
          </h2>
          <p className="text-xs text-[hsl(var(--erp-fg-muted))]">
            Eventos del ecosistema 8Q
          </p>
        </div>
      </div>
      <ul className="divide-y divide-[hsl(var(--erp-border-subtle))]">
        {items.map((item, index) => {
          const meta = TYPE_META[item.tipo];
          const Icon = meta.icon;
          return (
            <li
              key={`${item.id}-${index}`}
              className="flex gap-3 px-5 py-4 transition-colors hover:bg-[hsl(var(--erp-bg-hover)/0.4)]"
            >
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${meta.color}`}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[hsl(var(--erp-fg))]">
                  {item.titulo}
                </p>
                <p className="mt-0.5 text-xs text-[hsl(var(--erp-fg-muted))]">
                  {item.descripcion}
                </p>
              </div>
              <time className="shrink-0 text-[10px] text-[hsl(var(--erp-fg-subtle))]">
                {formatRelative(item.timestamp)}
              </time>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
