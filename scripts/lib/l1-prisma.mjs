/**
 * L1 — Prisma client con adapter pg (compatible PGlite socket + Neon staging)
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import pg from "pg";

import { loadEnvLocal } from "./l0-env.mjs";

loadEnvLocal();

export function createPrisma() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL missing");
  }
  const pool = new pg.Pool({ connectionString: url });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  return { prisma, pool };
}

export async function disconnectPrisma({ prisma, pool }) {
  await prisma.$disconnect();
  await pool.end();
}
