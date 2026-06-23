#!/usr/bin/env node
/**
 * M4.1 — tn_order_item_units schema push (staging Neon / PGlite only)
 * Ver docs/erp-m4-tn-item-units-adr.md
 */
import { loadEnvLocal } from "./lib/l0-env.mjs";
import { applyPushSql, generatePushSql } from "./l1-db-push.mjs";

loadEnvLocal();

const LABEL = "M4.1 db push";

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
