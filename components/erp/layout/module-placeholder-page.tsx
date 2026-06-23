import { Clock, Layers, Sparkles } from "lucide-react";

import type { ErpModulePageConfig } from "@/types/erp";

type ModulePlaceholderPageProps = {
  config: ErpModulePageConfig;
};

export function ModulePlaceholderPage({ config }: ModulePlaceholderPageProps) {
  const isComingSoon = config.status === "coming-soon";

  return (
    <div className="space-y-8 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span
              className={
                isComingSoon
                  ? "inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] font-medium text-amber-200"
                  : "inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--erp-accent)/0.35)] bg-[hsl(var(--erp-accent)/0.12)] px-3 py-1 text-[11px] font-medium text-[hsl(252_95%_75%)]"
              }
            >
              <Clock className="h-3.5 w-3.5" />
              {config.statusLabel}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--erp-border))] bg-[hsl(var(--erp-bg-card))] px-3 py-1 text-[11px] font-medium text-[hsl(var(--erp-fg-muted))]">
              <Sparkles className="h-3.5 w-3.5 text-[hsl(var(--erp-cyan))]" />
              Fase 1.5 · Placeholder
            </span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-[hsl(var(--erp-fg))] sm:text-3xl">
            {config.title}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-[hsl(var(--erp-fg-muted))]">
            {config.description}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {config.integrations.map((name, index) => (
              <span
                key={`${config.slug}-integration-${name}-${index}`}
                className="rounded-md border border-[hsl(var(--erp-border))] bg-[hsl(var(--erp-bg-hover))] px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-[hsl(var(--erp-fg-subtle))]"
              >
                {name}
              </span>
            ))}
          </div>
        </div>

        <div className="erp-card erp-card-glow max-w-sm shrink-0 p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[hsl(var(--erp-accent)/0.15)] text-[hsl(var(--erp-accent))]">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-[hsl(var(--erp-fg))]">
                Sin conexión a APIs
              </p>
              <p className="mt-1 text-xs leading-relaxed text-[hsl(var(--erp-fg-muted))]">
                Esta vista usa datos de demostración. Producción (/remitos, webhooks e
                imports) permanece intacta.
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {config.mockStats.map((stat, index) => (
          <div
            key={`${config.slug}-${stat.label}-${index}`}
            className="erp-card group p-4 transition-colors hover:border-[hsl(var(--erp-accent)/0.2)]"
          >
            <p className="text-[10px] font-medium uppercase tracking-wider text-[hsl(var(--erp-fg-subtle))]">
              {stat.label}
            </p>
            <p className="mt-2 text-xl font-semibold tabular-nums tracking-tight text-[hsl(var(--erp-fg))]">
              {stat.value}
            </p>
            {stat.hint && (
              <p className="mt-1 text-[11px] text-[hsl(var(--erp-fg-muted))]">
                {stat.hint}
              </p>
            )}
          </div>
        ))}
      </div>

      <section>
        <h2 className="mb-4 text-sm font-semibold text-[hsl(var(--erp-fg))]">
          Funcionalidades planificadas
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {config.plannedFeatures.map((feature, index) => (
            <div
              key={`${config.slug}-${feature}-${index}`}
              className="erp-card flex items-start gap-3 p-4 opacity-90"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[hsl(var(--erp-bg-hover))] text-[11px] font-semibold text-[hsl(var(--erp-accent))]">
                {index + 1}
              </span>
              <p className="text-sm text-[hsl(var(--erp-fg-muted))]">{feature}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="rounded-lg border border-dashed border-[hsl(var(--erp-border))] bg-[hsl(var(--erp-bg-card)/0.4)] px-4 py-3 text-center text-[11px] text-[hsl(var(--erp-fg-subtle))]">
        {isComingSoon
          ? "Este módulo se habilitará en una fase posterior. Navegación y shell ya están listos."
          : "Módulo en preparación — la estructura de ruta y diseño están listos para conectar datos reales."}
      </footer>
    </div>
  );
}
