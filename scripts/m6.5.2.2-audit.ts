/**
 * M6.5.2.2 — Audit single active account + chart dataset
 *
 *   npm run m6.5.2.2:audit
 *   ERP_V2_DB_WRITE=true npm run m6.5.2.2:audit -- --fix
 */
import fs from "fs";
import path from "path";

import { accountsForBalanceChart } from "../lib/financial-accounts/balance-chart";
import {
  fetchOperatingBalanceTotals,
} from "../lib/financial-accounts/operating-balance";
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

function validateUiInvariants(): {
  pass: boolean;
  activateButton: boolean;
  noDeactivateButton: boolean;
  chartAllAccounts: boolean;
  dashboardReadOnlySafe: boolean;
} {
  const tablePath = path.join(
    process.cwd(),
    "components/erp/financial-accounts/erp-financial-accounts-table.tsx"
  );
  const chartPath = path.join(
    process.cwd(),
    "components/erp/financial-accounts/erp-financial-accounts-balance-chart.tsx"
  );
  const dashboardPath = path.join(
    process.cwd(),
    "components/erp/financial-accounts/erp-financial-accounts-dashboard.tsx"
  );

  const tableSrc = fs.readFileSync(tablePath, "utf8");
  const chartSrc = fs.readFileSync(chartPath, "utf8");
  const dashboardSrc = fs.readFileSync(dashboardPath, "utf8");

  const dashboardReadOnlySafe =
    dashboardSrc.includes("loadError") &&
    dashboardSrc.includes("actionError") &&
    !dashboardSrc.includes("ERP_V2_DB_WRITE") &&
    !dashboardSrc.includes("checkErpV2DbWrite");

  return {
    activateButton:
      tableSrc.includes("Activar") &&
      tableSrc.includes("account.isActive !== true"),
    noDeactivateButton:
      !tableSrc.includes("Desactivar") && !tableSrc.includes("onDeactivate"),
    chartAllAccounts:
      chartSrc.includes("accountsForBalanceChart") &&
      !chartSrc.includes("filter((a) => a.isActive)"),
    dashboardReadOnlySafe,
    pass: false,
  };
}

function validateChartProportional(
  accounts: Array<{ operatingBalance: number }>
): { pass: boolean; reason?: string } {
  if (accounts.length < 2) return { pass: true };

  const balances = accounts.map((a) => a.operatingBalance);
  const positive = balances.filter((b) => b > 0);
  if (positive.length < 2) return { pass: true };

  const max = Math.max(...positive);
  const min = Math.min(...positive);
  if (max > 0 && min / max < 0.05) {
    return { pass: true };
  }

  const heights = positive.map((b) => (max > 0 ? (b / max) * 100 : 0));
  const heightUnique = new Set(heights.map((h) => Math.round(h)));
  if (heightUnique.size < 2) {
    return { pass: false, reason: "bar heights would not differ" };
  }

  return { pass: true };
}

function validateOperatingBalanceRows(
  accounts: Array<{
    name: string;
    billingTotal: number;
    transferFeeTotal: number;
    operatingBalance: number;
  }>
): { pass: boolean; reason?: string } {
  for (const a of accounts) {
    const expected = Math.round((a.billingTotal - a.transferFeeTotal) * 100) / 100;
    if (Math.abs(expected - a.operatingBalance) > 0.02) {
      return {
        pass: false,
        reason: `operatingBalance mismatch for ${a.name}`,
      };
    }
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
    const chartRows = accountsForBalanceChart(list.data);
    const chartCheck = validateChartProportional(list.data);
    const operatingCheck = validateOperatingBalanceRows(list.data);
    const totals = await fetchOperatingBalanceTotals();
    const sumOperating = list.data.reduce((s, a) => s + a.operatingBalance, 0);
    const ui = validateUiInvariants();
    ui.pass =
      ui.activateButton &&
      ui.noDeactivateButton &&
      ui.chartAllAccounts &&
      ui.dashboardReadOnlySafe;

    const destinationMatches =
      list.kpi.currentDestination?.id === assignmentKpi.activeAccountId &&
      list.kpi.currentDestination?.name === assignmentKpi.activeAccountName;

    const checks = {
      exactlyOneActive: activeRows.length === 1,
      atLeastOneActive: activeRows.length >= 1,
      noZeroActive: beforeActive === 0 ? enforce.afterActive === 1 : true,
      chartProportional: chartCheck.pass,
      operatingBalanceFormula: operatingCheck.pass,
      operatingTotalsMatch:
        Math.abs(sumOperating - totals.operatingBalanceTotal) <= 0.02,
      chartIncludesAllAccounts: chartRows.length === list.data.length,
      inactiveHaveActivateAction: ui.activateButton,
      noDeactivateButton: ui.noDeactivateButton,
      dashboardReadOnlySafe: ui.dashboardReadOnlySafe,
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
          operatingBalance: a.operatingBalance,
          billingTotal: a.billingTotal,
          transferFeeTotal: a.transferFeeTotal,
        })),
        ...chartCheck,
      },
      operatingTotals: totals,
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
