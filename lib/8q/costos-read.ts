import { Prisma } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";

import type { ProductoCosto } from "./costos.ts";

export type { ProductoCosto };

const STAGING_HOST = "ep-spring-frog-acago22x-pooler.sa-east-1.aws.neon.tech";

function baseAutorizada(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url.replace(/^postgres(ql)?:/, "http:"));
    return parsed.hostname === STAGING_HOST && parsed.pathname.replace(/^\//, "") === "neondb";
  } catch {
    return false;
  }
}

export async function leerCatalogoCostos(): Promise<{ tablas: boolean; productos: ProductoCosto[] }> {
  if (!baseAutorizada(process.env.DATABASE_URL)) return { tablas: false, productos: [] };
  const prisma = getPrisma();
  const tablas = await prisma.$queryRaw<{ vigencia: string | null }[]>(Prisma.sql`
    SELECT to_regclass('public.pilar_costo_vigencia')::text AS vigencia
  `);
  const filas = await prisma.$queryRaw<{ dueno: string; sku: string; nombre: string | null; unidades: number; neto: string | null }[]>(Prisma.sql`
    SELECT owner AS dueno,
           sku,
           max(articulo) AS nombre,
           coalesce(sum(cantidad), 0)::int AS unidades,
           round(sum(neto_prenda)::numeric, 2)::text AS neto
    FROM pilar_prendas
    WHERE duplicado = false
      AND owner IN ('8Q', 'SCNL')
      AND sku IS NOT NULL
      AND btrim(sku) <> ''
    GROUP BY owner, sku
    ORDER BY sum(cantidad) DESC, owner, sku
  `);
  return {
    tablas: Boolean(tablas[0]?.vigencia),
    productos: filas.map((fila) => ({
      dueno: fila.dueno,
      sku: fila.sku,
      nombre: fila.nombre?.trim() || fila.sku,
      unidades: Number(fila.unidades) || 0,
      neto: fila.neto == null ? null : Number(fila.neto),
      conCosto: false,
    })),
  };
}
