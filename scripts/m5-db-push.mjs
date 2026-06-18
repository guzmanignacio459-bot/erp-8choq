#!/usr/bin/env node
/**
 * M5.1 — sync_state + tn_updated_at schema push (staging Neon only)
 */
import { loadEnvLocal } from "./lib/l0-env.mjs";
import { applyPushSql, generatePushSql } from "./l1-db-push.mjs";

loadEnvLocal();

const LABEL = "M5.1 db push";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL missing");
    process.exit(1);
  }

  const { sql, mode } = generatePushSql(url);
  await applyPushSql(url, sql, mode, LABEL);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
