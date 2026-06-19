import { runPipelineHealthCheck } from "../services/erp-v2-pipeline-health";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { loadEnvLocal } = require("./lib/l0-env.mjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createPrisma, disconnectPrisma } = require("./lib/l1-prisma.mjs");

loadEnvLocal();

async function main() {
  const db = createPrisma();
  try {
    const health = await runPipelineHealthCheck();
    console.log(JSON.stringify(health, null, 2));
    if (health.overall === "FAIL") process.exitCode = 1;
  } finally {
    await disconnectPrisma(db);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
