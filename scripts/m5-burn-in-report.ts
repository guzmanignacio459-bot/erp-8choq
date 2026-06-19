/**
 * M5.5f — Burn-in operational report
 *
 *   npm run m5:burnin:report
 */
import fs from "fs";
import path from "path";

import { generateBurnInReport } from "../services/erp-v2-pipeline-health";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { loadEnvLocal } = require("./lib/l0-env.mjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createPrisma, disconnectPrisma } = require("./lib/l1-prisma.mjs");

const WIP = path.join(process.cwd(), "_wip");
const REPORT_PATH = path.join(WIP, "m5-burn-in-report.json");

loadEnvLocal();

function requireEnv() {
  if (!(process.env.DATABASE_URL ?? "").includes("neon.tech")) {
    throw new Error("DATABASE_URL (Neon staging) required");
  }
}

function fmtRate(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

async function main() {
  requireEnv();
  const db = createPrisma();
  const milestone = "M5.5f";

  try {
    const report = await generateBurnInReport();

    const output = {
      milestone,
      ...report,
      pass: report.windows.every(
        (w) => w.kpis.successRate >= 0.95 && w.projectionPassRate >= 0.95
      ),
    };

    fs.mkdirSync(WIP, { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(output, null, 2));

    for (const w of report.windows) {
      console.log(`[${milestone}] ${w.hours}h window`);
      console.log(`  runs: ${w.kpis.totalRuns} success=${fmtRate(w.kpis.successRate)}`);
      console.log(`  avg duration: ${w.kpis.avgDurationMs}ms max=${w.kpis.maxDurationMs}ms`);
      console.log(`  imports: ${w.kpis.ordersImported} warnings: ${w.kpis.warningsCount}`);
      console.log(`  projection pass rate: ${fmtRate(w.projectionPassRate)}`);
      console.log(`  drift fail runs: ${w.driftFailRuns}`);
      if (w.errors.length) console.log(`  errors:`, w.errors);
    }

    console.log(`[${milestone}] report:`, REPORT_PATH);
    console.log(`[${milestone}] overall pass:`, output.pass ? "YES" : "NO");
  } finally {
    await disconnectPrisma(db);
  }
}

main().catch((err) => {
  console.error("[M5.5f] fatal:", err);
  process.exit(1);
});
