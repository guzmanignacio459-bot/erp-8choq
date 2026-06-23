#!/usr/bin/env node
/**
 * M6.1 — financial_items schema push (staging Neon only)
 */
import fs from "fs";
import path from "path";

import { loadEnvLocal } from "./lib/l0-env.mjs";
import { applyPushSql, generatePushSql } from "./l1-db-push.mjs";

loadEnvLocal();

const LABEL = "M6.1 db push";
const MIGRATION_DOC = path.join(
  process.cwd(),
  "docs/erp-m6.1-financial-items-migration.sql"
);

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL missing");
    process.exit(1);
  }

  const { sql, mode } = generatePushSql(url);
  if (sql) {
    fs.writeFileSync(
      MIGRATION_DOC,
      `-- M6.1 Financial Items — generated ${new Date().toISOString()}\n-- mode: ${mode}\n\n${sql}\n`
    );
    console.log(`[${LABEL}] migration SQL → ${MIGRATION_DOC}`);
  }

  await applyPushSql(url, sql, mode, LABEL);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
