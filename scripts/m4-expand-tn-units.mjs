#!/usr/bin/env node
/**
 * M4.1 — Expande tn_order_items → tn_order_item_units (staging)
 *
 * Uso:
 *   node scripts/m4-expand-tn-units.mjs              # dry-run global
 *   node scripts/m4-expand-tn-units.mjs --tn-only    # dry-run 828 órdenes sin ERP
 *   node scripts/m4-expand-tn-units.mjs --write        # persist Neon
 *   node scripts/m4-expand-tn-units.mjs --tn-only --write
 */

import fs from "fs";
import path from "path";

import { loadEnvLocal } from "./lib/l0-env.mjs";
import { createPrisma, disconnectPrisma } from "./lib/l1-prisma.mjs";
import { expandTnOrderItemToUnits } from "./lib/m4-expand-units-core.mjs";

loadEnvLocal();

const WIP = path.join(process.cwd(), "_wip");

function parseArgs(argv) {
  return {
    tnOnly: argv.includes("--tn-only"),
    write: argv.includes("--write"),
  };
}

async function fetchLines(prisma, tnOnly) {
  if (tnOnly) {
    return prisma.$queryRaw`
      SELECT i.id, i.tn_order_id AS "tnOrderId", i.sku, i.quantity, i.unit_price AS "unitPrice"
      FROM tn_order_items i
      JOIN tn_orders o ON o.id = i.tn_order_id
      LEFT JOIN erp_orders e ON e.tn_order_id = o.id
      WHERE e.id IS NULL
      ORDER BY i.tn_order_id, i.id
    `;
  }
  return prisma.tnOrderItem.findMany({
    select: {
      id: true,
      tnOrderId: true,
      sku: true,
      quantity: true,
      unitPrice: true,
    },
    orderBy: [{ tnOrderId: "asc" }, { id: "asc" }],
  });
}

async function validateCoverage(prisma, scope) {
  const [items, units] = await Promise.all([
    scope.tnOnly
      ? prisma.$queryRaw`
          SELECT COALESCE(SUM(i.quantity),0)::int AS expected
          FROM tn_order_items i
          JOIN tn_orders o ON o.id = i.tn_order_id
          LEFT JOIN erp_orders e ON e.tn_order_id = o.id
          WHERE e.id IS NULL
        `
      : prisma.$queryRaw`
          SELECT COALESCE(SUM(quantity),0)::int AS expected FROM tn_order_items
        `,
    scope.tnOnly
      ? prisma.$queryRaw`
          SELECT COUNT(*)::int AS actual
          FROM tn_order_item_units u
          JOIN tn_orders o ON o.id = u.tn_order_id
          LEFT JOIN erp_orders e ON e.tn_order_id = o.id
          WHERE e.id IS NULL
        `
      : prisma.tnOrderItemUnit.count(),
  ]);

  const expected = Number(items[0]?.expected ?? items);
  const actual = Number(units[0]?.actual ?? units);
  return { expected, actual, ok: expected === actual };
}

async function main() {
  const args = parseArgs(process.argv);
  const db = createPrisma();
  const prisma = db.prisma;

  try {
    const lines = await fetchLines(prisma, args.tnOnly);
    let expectedUnits = 0;
    let allWarnings = [];
    const drafts = [];

    for (const line of lines) {
      const r = expandTnOrderItemToUnits({
        id: line.id,
        tnOrderId: line.tnOrderId,
        sku: line.sku,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
      });
      expectedUnits += r.expectedCount;
      allWarnings.push(...r.warnings);
      drafts.push(...r.units);
    }

    const report = {
      phase: "M4.1",
      generatedAt: new Date().toISOString(),
      scope: args.tnOnly ? "tn-only" : "global",
      dryRun: !args.write,
      lines: lines.length,
      expectedUnits,
      draftUnits: drafts.length,
      warnings: allWarnings.length,
      warningCodes: [...new Set(allWarnings.map((w) => w.code))],
      giftyUnits: drafts.filter((u) => u.isGifty).length,
      nonStockable: drafts.filter((u) => !u.isStockable).length,
    };

    console.log("[M4.1 expand]", JSON.stringify(report, null, 2));

    if (!args.write) {
      fs.mkdirSync(WIP, { recursive: true });
      const out = path.join(WIP, `m4-expand-units-dryrun-${report.scope}.json`);
      fs.writeFileSync(out, JSON.stringify({ report, sample: drafts.slice(0, 5) }, null, 2));
      console.log("[M4.1 expand] dry-run report:", out);
      return;
    }

    if (process.env.L1_ALLOW_WRITE !== "true") {
      throw new Error("L1_ALLOW_WRITE=true required for --write");
    }

    const itemIds = lines.map((l) => l.id);
    const BATCH = 500;
    let created = 0;

    for (let i = 0; i < itemIds.length; i += BATCH) {
      const batchIds = itemIds.slice(i, i + BATCH);
      await prisma.tnOrderItemUnit.deleteMany({
        where: { tnOrderItemId: { in: batchIds } },
      });
    }

    for (let i = 0; i < drafts.length; i += BATCH) {
      const batch = drafts.slice(i, i + BATCH);
      const res = await prisma.tnOrderItemUnit.createMany({ data: batch });
      created += res.count;
    }

    const coverage = await validateCoverage(prisma, { tnOnly: args.tnOnly });
    const finalReport = { ...report, dryRun: false, created, coverage };
    const out = path.join(WIP, `m4-expand-units-${report.scope}.json`);
    fs.mkdirSync(WIP, { recursive: true });
    fs.writeFileSync(out, JSON.stringify(finalReport, null, 2));

    console.log("[M4.1 expand] wrote", created, "units");
    console.log("[M4.1 expand] coverage", coverage);
    console.log("[M4.1 expand] report:", out);

    if (!coverage.ok) {
      process.exitCode = 1;
    }
  } finally {
    await disconnectPrisma(db);
  }
}

main().catch((e) => {
  console.error("[M4.1 expand] fatal:", e.message ?? e);
  process.exit(1);
});
