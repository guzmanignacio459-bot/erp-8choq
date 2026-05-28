import type { Metadata } from "next";

import { ErpShell } from "@/components/erp/layout/erp-shell";

import "./dashboard.css";

export const metadata: Metadata = {
  title: "Dashboard · 8CHOQ ERP",
  description:
    "Panel financiero-operativo 8CHOQ — Tiendanube, Mercado Pago, Sheets y Apps Script",
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ErpShell periodo="Últimos 30 días">{children}</ErpShell>;
}
