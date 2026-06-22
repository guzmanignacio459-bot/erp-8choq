/**
 * M5.6 — Stale pipeline check (+ optional email alert)
 *
 *   npm run m5:stale:check
 *   npm run m5:stale:check -- --dry-run
 */
import { checkPipelineStaleDrift, maybeSendStalePipelineAlert } from "../services/erp-v2-pipeline-stale-alert";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { loadEnvLocal } = require("./lib/l0-env.mjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createPrisma, disconnectPrisma } = require("./lib/l1-prisma.mjs");

loadEnvLocal();

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const db = createPrisma();

  try {
    const drift = await checkPipelineStaleDrift();
    const alert = await maybeSendStalePipelineAlert({ dryRun });

    const output = {
      generatedAt: new Date().toISOString(),
      dryRun,
      drift,
      alert,
    };

    console.log(JSON.stringify(output, null, 2));
  } finally {
    await disconnectPrisma(db);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
