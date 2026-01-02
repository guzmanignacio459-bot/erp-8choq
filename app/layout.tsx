import "./globals.css";
import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: "8CHOQ System",
  description: "Sistema de Remitos y Stock Integrado",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}
      >
        {children}
        <Toaster /> {/* ← necesario para mostrar los toasts */}
      </body>
    </html>
  );
}
