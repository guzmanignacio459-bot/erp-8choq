"use client";

import { useState } from "react";

import { ErpSidebar } from "@/components/erp/sidebar/erp-sidebar";
import { ErpTopbar } from "@/components/erp/topbar/erp-topbar";

type ErpShellProps = {
  periodo: string;
  children: React.ReactNode;
};

export function ErpShell({ periodo, children }: ErpShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="erp-shell min-h-screen">
      <ErpSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="lg:pl-[var(--erp-sidebar-w)]">
        <ErpTopbar
          periodo={periodo}
          onMenuClick={() => setSidebarOpen(true)}
        />
        <main className="erp-scrollbar min-h-[calc(100vh-var(--erp-topbar-h))] overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
