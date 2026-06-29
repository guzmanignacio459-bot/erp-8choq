/**
 * M6.5.2.5 — Validación FINANCIAL_ACCOUNTS_WRITE gate
 *
 *   npm run m6.5.2.5:write-gate:validate
 */
import fs from "fs";
import path from "path";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { loadEnvLocal } = require("./lib/l0-env.mjs");

loadEnvLocal();

const WIP = path.join(process.cwd(), "_wip");
const REPORT_PATH = path.join(WIP, "m6.5.2.5-write-gate-validation-report.json");

function withEnv(
  overrides: Record<string, string | undefined>,
  fn: () => unknown
): unknown {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(overrides)) {
    saved[key] = process.env[key];
    const v = overrides[key];
    if (v === undefined) delete process.env[key];
    else process.env[key] = v;
  }
  try {
    return fn();
  } finally {
    for (const [key, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[key];
      else process.env[key] = v;
    }
  }
}

function assertRoutesUseDedicatedGate(): {
  pass: boolean;
  financialAccountsOk: boolean;
  paymentsStillErp: boolean;
} {
  const faRoute = fs.readFileSync(
    path.join(process.cwd(), "app/api/v2/financial-accounts/route.ts"),
    "utf8"
  );
  const faIdRoute = fs.readFileSync(
    path.join(process.cwd(), "app/api/v2/financial-accounts/[id]/route.ts"),
    "utf8"
  );
  const periodsRoute = fs.readFileSync(
    path.join(process.cwd(), "app/api/v2/financial-account-periods/route.ts"),
    "utf8"
  );
  const paymentsRoute = fs.readFileSync(
    path.join(process.cwd(), "app/api/v2/payments/sync/route.ts"),
    "utf8"
  );

  const financialAccountsOk =
    faRoute.includes("checkFinancialAccountsWrite") &&
    !faRoute.includes("checkErpV2DbWrite") &&
    faIdRoute.includes("checkFinancialAccountsWrite") &&
    !faIdRoute.includes("checkErpV2DbWrite") &&
    periodsRoute.includes("checkFinancialAccountsWrite") &&
    !periodsRoute.includes("checkErpV2DbWrite");

  const paymentsStillErp =
    paymentsRoute.includes("checkErpV2DbWrite") &&
    !paymentsRoute.includes("checkFinancialAccountsWrite");

  return {
    pass: financialAccountsOk && paymentsStillErp,
    financialAccountsOk,
    paymentsStillErp,
  };
}

async function main() {
  const routeAudit = assertRoutesUseDedicatedGate();

  const case1 = withEnv(
    {
      ERP_V2_DB_READ: "true",
      FINANCIAL_ACCOUNTS_WRITE: "true",
      ERP_V2_DB_WRITE: "false",
    },
    () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      delete require.cache[require.resolve("../lib/db/assert-staging")];
      const {
        checkFinancialAccountsWrite,
        checkErpV2DbWrite,
      } = require("../lib/db/assert-staging");
      const fa = checkFinancialAccountsWrite();
      const erp = checkErpV2DbWrite();
      return {
        financialAccounts: { ok: fa.ok, status: fa.ok ? 200 : fa.status },
        erpWrite: { ok: erp.ok, status: erp.ok ? 200 : erp.status },
      };
    }
  ) as {
    financialAccounts: { ok: boolean; status: number };
    erpWrite: { ok: boolean; status: number };
  };

  const case2 = withEnv(
    {
      ERP_V2_DB_READ: "true",
      FINANCIAL_ACCOUNTS_WRITE: "false",
      ERP_V2_DB_WRITE: "false",
    },
    () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      delete require.cache[require.resolve("../lib/db/assert-staging")];
      const { checkFinancialAccountsWrite } = require("../lib/db/assert-staging");
      const fa = checkFinancialAccountsWrite();
      return { ok: fa.ok, status: fa.ok ? 200 : fa.status, message: fa.message };
    }
  ) as { ok: boolean; status: number; message: string };

  const case3 = withEnv(
    {
      ERP_V2_DB_READ: "true",
      FINANCIAL_ACCOUNTS_WRITE: "true",
      ERP_V2_DB_WRITE: "false",
    },
    () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      delete require.cache[require.resolve("../lib/db/assert-staging")];
      const { checkErpV2DbWrite } = require("../lib/db/assert-staging");
      const erp = checkErpV2DbWrite();
      return { ok: erp.ok, status: erp.ok ? 200 : erp.status, message: erp.message };
    }
  ) as { ok: boolean; status: number; message: string };

  const checks = {
    routesWired: routeAudit.pass,
    case1_faPatchAllowed: case1.financialAccounts.ok === true,
    case1_erpWriteBlocked: case1.erpWrite.ok === false && case1.erpWrite.status === 503,
    case2_faPatchBlocked: case2.ok === false && case2.status === 503,
    case3_paymentsSyncBlocked: case3.ok === false && case3.status === 503,
  };

  const report = {
    generatedAt: new Date().toISOString(),
    routeAudit,
    cases: {
      case1: {
        env: {
          ERP_V2_DB_READ: "true",
          FINANCIAL_ACCOUNTS_WRITE: "true",
          ERP_V2_DB_WRITE: "false",
        },
        expected: "PATCH financial-accounts → 200 gate ok",
        result: case1,
      },
      case2: {
        env: { ERP_V2_DB_READ: "true", FINANCIAL_ACCOUNTS_WRITE: "false" },
        expected: "PATCH financial-accounts → 503",
        result: case2,
      },
      case3: {
        env: { ERP_V2_DB_WRITE: "false" },
        expected: "POST payments/sync → 503",
        result: case3,
      },
    },
    checks,
    pass: Object.values(checks).every(Boolean),
  };

  fs.mkdirSync(WIP, { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log(`[M6.5.2.5] validation → ${REPORT_PATH}`);

  if (!report.pass) process.exitCode = 1;
}

main().catch((err) => {
  console.error("[M6.5.2.5] validate fatal:", err);
  process.exit(1);
});
