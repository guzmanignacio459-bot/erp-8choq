import type { ReactNode } from "react";

import { CommandsNav } from "@/components/8q/commands-nav";

export function CommandsShell({ children }: { children: ReactNode }) {
  return (
    <div className="erp-shell min-h-screen">
      <header className="border-b border-erp-border">
        <div className="mx-auto flex w-full max-w-6xl items-baseline justify-between gap-4 px-4 py-4">
          <div>
            <p className="text-micro uppercase text-erp-accent">8CHOQ</p>
            <h1 className="text-xl font-semibold tracking-tight">8Q COMMANDS</h1>
          </div>
          <p className="text-xs text-erp-fg-muted">{process.env.VERCEL ? "Publicado" : "Local"}</p>
        </div>
      </header>
      <CommandsNav />
      <main className="mx-auto w-full max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
