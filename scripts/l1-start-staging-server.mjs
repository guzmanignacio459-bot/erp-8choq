#!/usr/bin/env node
/**
 * L1.1 — PGlite socket staging (non-prod, local).
 * Neon: reemplazar DATABASE_URL por connection string de Neon staging.
 *
 * Uso: node scripts/l1-start-staging-server.mjs
 */

import fs from "fs";
import path from "path";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const PORT = Number(process.env.L1_STAGING_PORT ?? 5433);
const HOST = "127.0.0.1";
const DATA_DIR = path.join(process.cwd(), ".pglite-staging");

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = await PGlite.create({ dataDir: DATA_DIR });
  const server = new PGLiteSocketServer({ db, port: PORT, host: HOST });
  await server.start();
  const url = `postgresql://postgres@${HOST}:${PORT}/postgres`;
  console.log(`[L1 staging] PGlite listening ${HOST}:${PORT}`);
  console.log(`[L1 staging] DATABASE_URL=${url}`);
  console.log("[L1 staging] Press Ctrl+C to stop");

  const shutdown = async () => {
    await server.stop();
    await db.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
