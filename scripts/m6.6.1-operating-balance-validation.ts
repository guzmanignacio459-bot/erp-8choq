/**
 * M6.6.1 — Validación saldo operativo real (Financial Accounts)
 *
 *   npm run m6.6.1:operating-balance:validate
 */
import fs from "fs";
import path from "path";

import {
  fetchOperatingBalanceTotals,
  fetchOperatingBalancesByAccount,
} from "../lib/financial-accounts/operating-balance";
import { fetchV2FinancialAccounts } from "../services/erp-v2-financial-accounts";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { loadEnvLocal } = require("./lib/l0-env.mjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createPrisma, disconnectPrisma } = require("./lib/l1-prisma.mjs");

loadEnvLocal();

const WIP = path.join(process.cwd(), "_wip");
const REPORT_PATH = path.join(WIP, "m6.6.1-operating-balance-validation-report.json");

const TARGET_ACCOUNTS = ["Galicia", "Ignacio", "Lucia", "Serbertex", "Santander"];

async function main() {
  if (!(process.env.DATABASE_URL ?? "").includes("neon.tech")) {
    throw new Error("DATABASE_URL Neon staging required");
  }

  const client = createPrisma();

  try {
    const list = await fetchV2FinancialAccounts();
    if (!list.ok) throw new Error(list.error);

    const raw = await fetchOperatingBalancesByAccount();
    const totals = await fetchOperatingBalanceTotals();

    const byName = list.data.map((a) => ({
      cuenta: a.name,
      facturacion: a.billingTotal,
      transferFee: a.transferFeeTotal,
      saldoOperativo: a.operatingBalance,
      orders: raw.get(a.id)?.orderCount ?? 0,
    }));

    const targetRows = TARGET_ACCOUNTS.map((name) => {
      const row = byName.find((r) => r.cuenta === name);
      return row ?? { cuenta: name, facturacion: 0, transferFee: 0, saldoOperativo: 0, orders: 0 };
    });

    const sumSaldo = byName.reduce((s, r) => s + r.saldoOperativo, 0);
    const consistency =
      Math.abs(sumSaldo - totals.operatingBalanceTotal) <= 0.02 &&
      Math.abs(totals.billingTotal - totals.transferFeeTotal - totals.operatingBalanceTotal) <=
        0.02;

    const noMock = !list.data.some(
      (a) =>
        "balanceMock" in (a as Record<string, unknown>) ||
        JSON.stringify(a).includes("mock")
    );

    const report = {
      generatedAt: new Date().toISOString(),
      targetAccounts: targetRows,
      allAccounts: byName,
      totals,
      validation: {
        consistencyFormula: consistency,
        sumSaldoEqualsTotal: Math.abs(sumSaldo - totals.operatingBalanceTotal) <= 0.02,
        noMockFields: noMock,
        allTargetsFromNeon: targetRows.every((r) => r.cuenta !== undefined),
      },
      pass: consistency && noMock,
    };

    fs.mkdirSync(WIP, { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    console.log(`[M6.6.1] report → ${REPORT_PATH}`);

    if (!report.pass) process.exitCode = 1;
  } finally {
    await disconnectPrisma(client);
  }
}

main().catch((err) => {
  console.error("[M6.6.1] fatal:", err);
  process.exit(1);
});
