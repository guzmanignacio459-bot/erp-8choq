#!/usr/bin/env node
/**
 * L1 schema push — SQL vía pg (PGlite local + Neon staging).
 *
 * - Genera diff incremental (--from-url) cuando Prisma puede introspeccionar.
 * - Fallback --from-empty + transform idempotente (PGlite / DB vacía).
 * - Nunca usa prisma db push directo (evita DefineEnum duplicado en re-runs).
 */
import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

import { loadEnvLocal } from "./lib/l0-env.mjs";

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) loadEnvLocal();

const SKIP_PG_CODES = new Set([
  "42710", // duplicate_object (enum, constraint, …)
  "42P07", // duplicate_table
  "42701", // duplicate_column
  "42P06", // duplicate_schema
  "23505", // unique_violation (enum type race / partial re-run)
]);

function runMigrateDiff(args) {
  return spawnSync("npx", ["prisma", "migrate", "diff", ...args, "--script"], {
    encoding: "utf8",
    env: process.env,
    shell: false,
  });
}

export function generatePushSql(url) {
  const incremental = runMigrateDiff([
    "--from-url",
    url,
    "--to-schema-datamodel",
    "prisma/schema.prisma",
  ]);

  if (incremental.status === 0) {
    const raw = incremental.stdout.trim();
    if (raw) {
      return { sql: idempotentSql(raw), mode: "incremental-idempotent" };
    }
    return { sql: "", mode: "noop" };
  }

  const empty = runMigrateDiff([
    "--from-empty",
    "--to-schema-datamodel",
    "prisma/schema.prisma",
  ]);
  if (empty.status !== 0) {
    console.error(empty.stderr || empty.stdout || incremental.stderr);
    process.exit(empty.status ?? incremental.status ?? 1);
  }

  return {
    sql: idempotentSql(empty.stdout.trim()),
    mode: "from-empty-idempotent",
  };
}

/**
 * Prisma --from-empty no es idempotente: re-runs fallan en enums/tablas existentes.
 * PG no tiene CREATE TYPE IF NOT EXISTS — usamos DO/EXCEPTION.
 */
export function idempotentSql(sql) {
  let out = sql;

  out = out.replace(
    /^CREATE TYPE "([^"]+)" AS ENUM \(([^)]+)\);$/gm,
    `DO $mig$ BEGIN
  CREATE TYPE "$1" AS ENUM ($2);
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;`
  );

  out = out.replace(/^CREATE TABLE (?!IF NOT EXISTS)/gm, "CREATE TABLE IF NOT EXISTS ");
  out = out.replace(
    /^CREATE UNIQUE INDEX (?!IF NOT EXISTS)/gm,
    "CREATE UNIQUE INDEX IF NOT EXISTS "
  );
  out = out.replace(/^CREATE INDEX (?!IF NOT EXISTS)/gm, "CREATE INDEX IF NOT EXISTS ");

  out = out.replace(
    /^ALTER TABLE "([^"]+)" ADD CONSTRAINT "([^"]+)" (.+);$/gm,
    `DO $mig$ BEGIN
  ALTER TABLE "$1" ADD CONSTRAINT "$2" $3;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;`
  );

  return out;
}

function normalizeStatement(stmt) {
  return stmt
    .split("\n")
    .filter((line) => !/^\s*--/.test(line))
    .join("\n")
    .trim();
}

/** Split on semicolons outside $tag$ … $tag$ blocks (DO bodies). */
export function splitSqlStatements(sql) {
  const statements = [];
  let current = "";
  let dollarTag = null;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];

    if (dollarTag === null && ch === "$") {
      const rest = sql.slice(i);
      const open = rest.match(/^(\$[A-Za-z0-9_]*\$)/);
      if (open) {
        dollarTag = open[1];
        current += open[1];
        i += open[1].length - 1;
        continue;
      }
    } else if (dollarTag !== null && sql.startsWith(dollarTag, i)) {
      current += dollarTag;
      i += dollarTag.length - 1;
      dollarTag = null;
      continue;
    }

    if (dollarTag === null && ch === ";") {
      const stmt = normalizeStatement(current);
      if (stmt) statements.push(stmt);
      current = "";
      continue;
    }

    current += ch;
  }

  const tail = normalizeStatement(current);
  if (tail) statements.push(tail);
  return statements;
}

export async function applyPushSql(url, sql, mode, label = "L1 db push") {
  if (!sql) {
    console.log(`[${label}] schema already in sync (no diff)`);
    return;
  }

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const statements = splitSqlStatements(sql);
  let applied = 0;
  let skipped = 0;

  try {
    for (const stmt of statements) {
      try {
        await client.query(stmt);
        applied++;
      } catch (e) {
        if (SKIP_PG_CODES.has(e.code)) {
          skipped++;
          console.log(`[${label}] skip ${e.code}: ${stmt.slice(0, 72).replace(/\s+/g, " ")}…`);
          continue;
        }
        throw e;
      }
    }
    console.log(
      `[${label}] OK mode=${mode} statements=${statements.length} applied=${applied} skipped=${skipped}`
    );
  } finally {
    await client.end();
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL missing");
    process.exit(1);
  }

  const { sql, mode } = generatePushSql(url);
  await applyPushSql(url, sql, mode);
}

if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
