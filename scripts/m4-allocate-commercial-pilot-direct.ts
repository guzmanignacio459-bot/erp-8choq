/**
 * M4.2a — Pilot directo (sin API server) — staging TN-only 25 órdenes
 */
import fs from "fs";
import path from "path";

import {
  allocateTnOrderCommercialOnly,
  summarizeValidationFailures,
} from "../services/erp-v2-allocations-commercial";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { loadEnvLocal } = require("./lib/l0-env.mjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createPrisma, disconnectPrisma } = require("./lib/l1-prisma.mjs");

const PILOT_SIZE = 25;
const WIP = path.join(process.cwd(), "_wip");

loadEnvLocal();

function requirePilotEnv() {
  const missing: string[] = [];
  if (process.env.ERP_V2_DB_WRITE !== "true") missing.push("ERP_V2_DB_WRITE=true");
  if (!(process.env.DATABASE_URL ?? "").includes("neon.tech")) {
    missing.push("DATABASE_URL (Neon staging)");
  }
  if (missing.length) {
    throw new Error(`Pilot env missing: ${missing.join(", ")}`);
  }
}

async function countTnOnlyUniverse(prisma: {
  $queryRaw: (strings: TemplateStringsArray) => Promise<
    Array<{ orders: number; units: number }>
  >;
}) {
  const rows = await prisma.$queryRaw`
    SELECT
      COUNT(DISTINCT o.id)::int AS orders,
      COUNT(u.id)::int AS units
    FROM tn_orders o
    LEFT JOIN erp_orders e ON e.tn_order_id = o.id
    JOIN tn_order_item_units u ON u.tn_order_id = o.id
    WHERE e.id IS NULL
  `;
  return rows[0] ?? { orders: 0, units: 0 };
}

async function pickPilotTnIds(prisma: {
  $queryRaw: (
    strings: TemplateStringsArray,
    limit: number
  ) => Promise<Array<{ id: string | number }>>;
}) {
  const rows = await prisma.$queryRaw`
    SELECT o.id
    FROM tn_orders o
    LEFT JOIN erp_orders e ON e.tn_order_id = o.id
    WHERE e.id IS NULL
      AND EXISTS (
        SELECT 1 FROM tn_order_item_units u WHERE u.tn_order_id = o.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM tn_order_item_allocations a WHERE a.tn_order_id = o.id
      )
    ORDER BY o.id ASC
    LIMIT ${PILOT_SIZE}
  `;
  return rows.map((r) => String(r.id));
}

async function coverageAfterPilot(
  prisma: {
    $queryRaw: (
      strings: TemplateStringsArray,
      ids: string[]
    ) => Promise<Array<{ n: number }>>;
  },
  pilotIds: string[]
) {
  const [allocRows, unitRows] = await Promise.all([
    prisma.$queryRaw`
      SELECT COUNT(*)::int AS n
      FROM tn_order_item_allocations a
      WHERE a.tn_order_id = ANY(${pilotIds}::text[])
    `,
    prisma.$queryRaw`
      SELECT COUNT(*)::int AS n
      FROM tn_order_item_units u
      WHERE u.tn_order_id = ANY(${pilotIds}::text[])
    `,
  ]);
  const allocations = allocRows[0]?.n ?? 0;
  const units = unitRows[0]?.n ?? 0;
  return {
    pilotOrders: pilotIds.length,
    pilotUnits: units,
    pilotAllocations: allocations,
    unitCoveragePct: units ? Math.round((allocations / units) * 10000) / 100 : 0,
  };
}

async function main() {
  requirePilotEnv();

  const db = createPrisma();
  const { prisma } = db;

  try {
    const universe = await countTnOnlyUniverse(prisma);
    const tnOrderIds = await pickPilotTnIds(prisma);

    if (!tnOrderIds.length) {
      throw new Error("sin órdenes TN-only elegibles para pilot");
    }

    console.log("[M4.2a pilot] TN-only universe:", universe);
    console.log("[M4.2a pilot] sample size:", tnOrderIds.length);
    console.log("[M4.2a pilot] ids:", tnOrderIds);

    const dryResults = [];
    for (const id of tnOrderIds) {
      dryResults.push(
        await allocateTnOrderCommercialOnly(id, { dryRun: true })
      );
    }
    const dryFailures = summarizeValidationFailures(dryResults);
    const dryFailed = dryResults.filter((r) => !r.ok).length;
    console.log("[M4.2a pilot] dry-run failed:", dryFailed);
    if (dryFailed > 0) {
      console.log(JSON.stringify({ dryFailures, dryResults }, null, 2));
      throw new Error("dry-run validation failed");
    }

    const writeResults = [];
    for (const id of tnOrderIds) {
      writeResults.push(await allocateTnOrderCommercialOnly(id, { dryRun: false }));
    }
    const writeFailures = summarizeValidationFailures(writeResults);
    const writeFailed = writeResults.filter((r) => !r.ok).length;
    const units = writeResults
      .filter((r) => r.ok)
      .reduce((a, r) => a + (r.ok ? r.unitCount : 0), 0);

    console.log("[M4.2a pilot] write failed:", writeFailed, "units:", units);
    if (writeFailed > 0) {
      console.log(JSON.stringify({ writeFailures, writeResults }, null, 2));
    }

    const coverage = await coverageAfterPilot(prisma, tnOrderIds);

    const report = {
      generatedAt: new Date().toISOString(),
      milestone: "M4.2a",
      pilotSize: tnOrderIds.length,
      tnOnlyUniverse: universe,
      tnOrderIds,
      dryRun: {
        ok: dryFailed === 0,
        failed: dryFailed,
        validationFailures: dryFailures,
      },
      write: {
        ok: writeFailed === 0,
        allocated: writeResults.filter((r) => r.ok).length,
        failed: writeFailed,
        units,
        validationFailures: writeFailures,
      },
      coverage,
      validations: {
        "V-C1": "Σ discount_allocated = pool_discount",
        "V-C2": "Σ shipping_allocated = pool_shipping_owner",
        "V-C3": "Σ fee_allocated = pool_fee_commercial (0)",
        "V-C4": "Σ neto_prenda = Σ unit_price - Σ discount + Σ fee",
        "V-C5": "Σ unit_price ≈ tn_subtotal (±0.01)",
        "V-C6": "Σ neto_prenda + shipping_paid ≈ tn_total (±0.01)",
      },
    };

    fs.mkdirSync(WIP, { recursive: true });
    const outPath = path.join(WIP, "m4-allocate-commercial-pilot.json");
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log("[M4.2a pilot] report:", outPath);

    if (writeFailed > 0) {
      process.exitCode = 1;
    }
  } finally {
    await disconnectPrisma(db);
  }
}

main().catch((e: unknown) => {
  const message = e instanceof Error ? e.message : String(e);
  console.error("[M4.2a pilot] failed:", message);
  process.exit(1);
});
