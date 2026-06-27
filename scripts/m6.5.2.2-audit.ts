/**
 * M6.5.2.2 — Audit single active account + chart dataset
 *
 *   npm run m6.5.2.2:audit
 *   ERP_V2_DB_WRITE=true npm run m6.5.2.2:audit -- --fix
 */
import fs from "fs";
import path from "path";

import { mockAccountBalance } from "../lib/financial-accounts/mock-balance";
import {
  enforceSingleActiveFinancialAccount,
  fetchV2FinancialAccounts,
} from "../services/erp-v2-financial-accounts";
import { fetchTransferAssignmentKpi } from "../services/erp-v2-financial-account-assignments";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { loadEnvLocal } = require("./lib/l0-env.mjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createPrisma, disconnectPrisma } = require("./lib/l1-prisma.mjs");

loadEnvLocal();

const WIP = path.join(process.cwd(), "_wip");
const REPORT_PATH = path.join(WIP, "m6.5.2.2-audit-report.json");

function validateChartProportional(
  accounts: Array<{ id: string; ratePercent: number; balanceMock: number }>
): { pass: boolean; reason?: string } {
  if (accounts.length < 2) return { pass: true };

  const balances = accounts.map((a) => a.balanceMock);
  const unique = new Set(balances);
  if (unique.size < 2) {
    return { pass: false, reason: "all balances identical — chart not proportional" };
  }

  const max = Math.max(...balances);
  const min = Math.min(...balances.filter((b) => b > 0));
  if (max > 0 && min / max < 0.05) {
    return { pass: true };
  }

  for (const a of accounts) {
    const expected = mockAccountBalance(a.id, a.ratePercent);
    if (Math.abs(expected - a.balanceMock) > 0.01) {
      return {
        pass: false,
        reason: `balanceMock mismatch for ${a.id}`,
      };
    }
  }

  const heights = accounts.map((a) =>
    max > 0 ? (a.balanceMock / max) * 100 : 0
  );
  const heightUnique = new Set(heights.map((h) => Math.round(h)));
  if (heightUnique.size < 2) {
    return { pass: false, reason: "bar heights would not differ" };
  }

  return { pass: true };
}

async function main() {
  const fix = process.argv.includes("--fix");

  if (!(process.env.DATABASE_URL ?? "").includes("neon.tech")) {
    throw new Error("DATABASE_URL Neon staging required");
  }

  const client = createPrisma();
  const { prisma } = client;

  try {
    const beforeActive = await prisma.financialAccount.count({
      where: { isActive: true },
    });

    let enforce = {
      beforeActive,
      afterActive: beforeActive,
      chosenId: null as string | null,
      dryRun: !fix,
    };

    if (beforeActive !== 1) {
      enforce = await enforceSingleActiveFinancialAccount({ dryRun: !fix });
    }

    const list = await fetchV2FinancialAccounts();
    if (!list.ok) throw new Error(list.error);

    const assignmentKpi = await fetchTransferAssignmentKpi();
    const activeRows = list.data.filter((a) => a.isActive);
    const chartCheck = validateChartProportional(list.data);

    const destinationMatches =
      list.kpi.currentDestination?.id === assignmentKpi.activeAccountId &&
      list.kpi.currentDestination?.name === assignmentKpi.activeAccountName;

    const checks = {
      exactlyOneActive: activeRows.length === 1,
      atLeastOneActive: activeRows.length >= 1,
      noZeroActive: beforeActive === 0 ? enforce.afterActive === 1 : true,
      chartProportional: chartCheck.pass,
      dashboardDestination: destinationMatches,
    };

    const report = {
      generatedAt: new Date().toISOString(),
      mode: fix ? "fix" : "audit",
      beforeActiveCount: beforeActive,
      enforce,
      activeAccount: activeRows[0]
        ? {
            id: activeRows[0].id,
            name: activeRows[0].name,
            ratePercent: activeRows[0].ratePercent,
          }
        : null,
      assignmentKpi: {
        activeAccountName: assignmentKpi.activeAccountName,
        activeAccountRatePercent: assignmentKpi.activeAccountRatePercent,
      },
      chart: {
        accountCount: list.data.length,
        balances: list.data.map((a) => ({
          name: a.name,
          balanceMock: a.balanceMock,
        })),
        ...chartCheck,
      },
      checks,
      pass: Object.values(checks).every(Boolean),
    };

    fs.mkdirSync(WIP, { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    console.log(`[M6.5.2.2] audit → ${REPORT_PATH}`);

    if (!report.pass) process.exitCode = 1;
  } finally {
    await disconnectPrisma(client);
  }
}

main().catch((err) => {
  console.error("[M6.5.2.2] audit fatal:", err);
  process.exit(1);
});
