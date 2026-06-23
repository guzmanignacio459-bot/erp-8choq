/**
 * Prisma client — ERP V2 staging (driver adapter pg)
 * Usar solo tras checkErpV2DbRead() en rutas /api/v2/*
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import pg from "pg";

const globalForPrisma = globalThis as unknown as {
  prismaPool?: pg.Pool;
  prisma?: PrismaClient;
};

function getPool(): pg.Pool {
  if (!globalForPrisma.prismaPool) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL missing");
    }
    globalForPrisma.prismaPool = new pg.Pool({ connectionString: url });
  }
  return globalForPrisma.prismaPool;
}

export function getPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) {
    const adapter = new PrismaPg(getPool());
    globalForPrisma.prisma = new PrismaClient({ adapter });
  }
  return globalForPrisma.prisma;
}
