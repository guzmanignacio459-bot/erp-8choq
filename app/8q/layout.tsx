import type { Metadata } from "next";
import type { ReactNode } from "react";

import { CommandsShell } from "@/components/8q/commands-shell";

import "../design-system/erp-tokens.css";

export const metadata: Metadata = {
  title: "8Q COMMANDS",
  description: "Frontend local de 8Q COMMANDS. No reemplaza el ERP en producción.",
  robots: { index: false, follow: false },
};

export default function EightQLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <CommandsShell>{children}</CommandsShell>;
}
