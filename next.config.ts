// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // 👇 MUY IMPORTANTE: NO usar `output: 'export'` porque rompe /api/*
  // output: 'export',  // ← NO PONER ESTO

  experimental: {
    // opcional, pero útil si usás server actions en el futuro
    serverActions: true,
  },
  // Si querés ver logs de server en Vercel:
  // logging: { fetches: { fullUrl: true } },
};

export default nextConfig;
