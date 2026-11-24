import { Prisma } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";

import type { ProductoCosto, VigenciaCosto } from "./costos.ts";

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

export type { VigenciaCosto };

export async function leerCatalogoCostos(): Promise<{ tablas: boolean; productos: ProductoCosto[]; vigencias: VigenciaCosto[] }> {
  if (!baseAutorizada(process.env.DATABASE_URL)) return { tablas: false, productos: [], vigencias: [] };
  const prisma = getPrisma();
  const tablas = await prisma.$queryRaw<{ vigencia: string | null }[]>(Prisma.sql`
    SELECT to_regclass('public.pilar_costo_vigencia')::text AS vigencia
  `);
  const filas = await prisma.$queryRaw<{ dueno: string; sku: string; nombre: string | null; unidades: number; neto: string | null; con_costo: boolean }[]>(Prisma.sql`
    SELECT owner AS dueno,
           sku,
           max(articulo) AS nombre,
           coalesce(sum(cantidad), 0)::int AS unidades,
           round(sum(neto_prenda)::numeric, 2)::text AS neto,
           EXISTS (
             SELECT 1 FROM pilar_costo_vigencia v
             WHERE v.owner = owner AND v.sku = sku AND v.costo_unitario IS NOT NULL
           ) AS con_costo
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
      conCosto: Boolean(fila.con_costo),
    })),
    vigencias: (await prisma.$queryRaw<{ dueno: string; sku: string; desde: string; modalidad: string; costo: string }[]>(Prisma.sql`
      SELECT owner AS dueno, sku, vigente_desde::text AS desde, modalidad, costo_unitario::text AS costo
      FROM pilar_costo_vigencia
      WHERE costo_unitario IS NOT NULL
      ORDER BY vigente_desde DESC, owner, sku
    `)),
  };
}

export async function guardarVigencias(input: {
  dueno: string;
  desde: string;
  modalidad: "directo" | "desglosado";
  costoUnitario: number | null;
  partes: { materiaPrima: number | null; manoObra: number | null; avios: number | null; otros: number | null };
  skus: string[];
}): Promise<{ ok: true; filas: number } | { ok: false; error: "base" | "incompleto" | "duplicada" }> {
  if (!baseAutorizada(process.env.DATABASE_URL)) return { ok: false, error: "base" };
  if (input.costoUnitario == null || input.skus.length === 0 || !/^\d{4}-\d{2}-\d{2}$/.test(input.desde)) {
    return { ok: false, error: "incompleto" };
  }
  if (input.dueno !== "8Q" && input.dueno !== "SCNL") return { ok: false, error: "incompleto" };
  const prisma = getPrisma();
  try {
    let filas = 0;
    await prisma.$transaction(async (tx) => {
      for (const sku of input.skus) {
        const id = `${input.dueno}:${sku}:${input.desde}`;
        const escritas = input.modalidad === "desglosado"
          ? await tx.$executeRaw`
            INSERT INTO pilar_costo_vigencia
              (id, owner, sku, vigente_desde, modalidad, materia_prima, mano_obra, avios, otros, costo_unitario)
            VALUES (
              ${id}, ${input.dueno}, ${sku}, ${input.desde}::date, ${input.modalidad},
              ${input.partes.materiaPrima}, ${input.partes.manoObra}, ${input.partes.avios}, ${input.partes.otros},
              ${input.costoUnitario}
            )
          `
          : await tx.$executeRaw`
            INSERT INTO pilar_costo_vigencia
              (id, owner, sku, vigente_desde, modalidad, costo_unitario)
            VALUES (${id}, ${input.dueno}, ${sku}, ${input.desde}::date, ${input.modalidad}, ${input.costoUnitario})
          `;
        filas += Number(escritas) || 0;
      }
    });
    return { ok: true, filas };
  } catch (error) {
    const codigo = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    if (codigo === "23505" || codigo === "P2002") return { ok: false, error: "duplicada" };
    return { ok: false, error: "incompleto" };
  }
}
