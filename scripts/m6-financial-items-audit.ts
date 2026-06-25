/**
 * M6.2 — Paridad Financial Items vs TN order allocations (100%)
 */
import fs from "fs";
import path from "path";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { loadEnvLocal } = require("./lib/l0-env.mjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createPrisma, disconnectPrisma } = require("./lib/l1-prisma.mjs");

loadEnvLocal();

const WIP = path.join(process.cwd(), "_wip");
const REPORT_PATH = path.join(WIP, "m6-financial-items-audit-report.json");
const PARITY_TOLERANCE = 1;

function num(v: unknown): number {
  if (v == null) return 0;
  return Number(v);
}

function withinTolerance(delta: number): boolean {
  return Math.abs(delta) < PARITY_TOLERANCE;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url?.includes("neon.tech")) {
    throw new Error("DATABASE_URL Neon staging required");
  }

  const client = createPrisma();
  const { prisma } = client;

  try {
    const [
      fiAgg,
      fiCount,
      unitCount,
      unitWithAllocCount,
      fiTnCount,
      allocSums,
    ] = await Promise.all([
      prisma.financialItem.aggregate({
        where: { originType: "TN_ORDER" },
        _sum: {
          grossAmount: true,
          discountAllocated: true,
          tnFeeAllocated: true,
          mpFeeAllocated: true,
          shippingAllocated: true,
          netAmount: true,
        },
      }),
      prisma.financialItem.count({ where: { originType: "TN_ORDER" } }),
      prisma.tnOrderItemUnit.count(),
      prisma.tnOrderItemUnit.count({ where: { allocation: { isNot: null } } }),
      prisma.financialItem.count(),
      prisma.$queryRaw<
        [
          {
            gross: string | null;
            discount: string | null;
            tn_fee: string | null;
            mp_fee: string | null;
            shipping: string | null;
            net_real: string | null;
          },
        ]
      >`
        SELECT
          SUM(gross_unit_amount) AS gross,
          SUM(discount_allocated) AS discount,
          SUM(fee_allocated) AS tn_fee,
          SUM(
            COALESCE(
              mp_total_cost_allocated_real,
              COALESCE(mp_fee_allocated_real, 0)
                + COALESCE(mp_tax_allocated_real, 0)
                + COALESCE(mp_financing_allocated_real, 0)
                + COALESCE(mp_platform_fee_allocated_real, 0)
            )
          ) AS mp_fee,
          SUM(shipping_allocated) AS shipping,
          SUM(
            gross_unit_amount
              - discount_allocated
              - fee_allocated
              - shipping_allocated
              - COALESCE(
                  mp_total_cost_allocated_real,
                  COALESCE(mp_fee_allocated_real, 0)
                    + COALESCE(mp_tax_allocated_real, 0)
                    + COALESCE(mp_financing_allocated_real, 0)
                    + COALESCE(mp_platform_fee_allocated_real, 0)
                )
          ) AS net_real
        FROM tn_order_item_allocations
      `,
    ]);

    const fi = {
      count: fiCount,
      gross: num(fiAgg._sum.grossAmount),
      discount: num(fiAgg._sum.discountAllocated),
      tnFee: num(fiAgg._sum.tnFeeAllocated),
      mpFee: num(fiAgg._sum.mpFeeAllocated),
      shipping: num(fiAgg._sum.shippingAllocated),
      netReal: num(fiAgg._sum.netAmount),
    };

    const allocations = {
      count: unitWithAllocCount,
      gross: num(allocSums[0]?.gross),
      discount: num(allocSums[0]?.discount),
      tnFee: num(allocSums[0]?.tn_fee),
      mpFee: num(allocSums[0]?.mp_fee),
      shipping: num(allocSums[0]?.shipping),
      netReal: num(allocSums[0]?.net_real),
    };

    const parity = {
      gross: fi.gross - allocations.gross,
      discount: fi.discount - allocations.discount,
      tnFee: fi.tnFee - allocations.tnFee,
      mpFee: fi.mpFee - allocations.mpFee,
      shipping: fi.shipping - allocations.shipping,
      netReal: fi.netReal - allocations.netReal,
      itemCountVsUnits: fi.count - unitCount,
      itemCountVsUnitsWithAlloc: fi.count - unitWithAllocCount,
    };

    const parityPct = {
      gross: allocations.gross ? (fi.gross / allocations.gross) * 100 : 100,
      discount: allocations.discount
        ? (fi.discount / allocations.discount) * 100
        : 100,
      tnFee: allocations.tnFee ? (fi.tnFee / allocations.tnFee) * 100 : 100,
      mpFee: allocations.mpFee ? (fi.mpFee / allocations.mpFee) * 100 : 100,
      shipping: allocations.shipping
        ? (fi.shipping / allocations.shipping) * 100
        : 100,
      netReal: allocations.netReal
        ? (fi.netReal / allocations.netReal) * 100
        : 100,
    };

    const report = {
      generatedAt: new Date().toISOString(),
      version: "m6.2",
      financialItems: fi,
      orderAllocations: allocations,
      units: { total: unitCount, withAllocation: unitWithAllocCount },
      parity,
      parityPct,
      tolerance: PARITY_TOLERANCE,
      notes: [
        "net_real = gross − discount − tn_fee − mp_fee − shipping",
        "MP fee en allocations: COALESCE(mp_total_cost_allocated_real, sum MP parts)",
        `financial_items total rows (all origins): ${fiTnCount}`,
        "Paridad 100%: |delta| < tolerance en gross, discount, tnFee, mpFee, shipping, netReal",
      ],
      pass:
        withinTolerance(parity.gross) &&
        withinTolerance(parity.discount) &&
        withinTolerance(parity.tnFee) &&
        withinTolerance(parity.mpFee) &&
        withinTolerance(parity.shipping) &&
        withinTolerance(parity.netReal) &&
        Math.abs(parity.itemCountVsUnitsWithAlloc) <= 6,
    };

    fs.mkdirSync(WIP, { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

    console.log(JSON.stringify(report, null, 2));
    console.log(`[M6.2] audit report → ${REPORT_PATH}`);

    if (!report.pass) process.exitCode = 1;
  } finally {
    await disconnectPrisma(client);
  }
}

main().catch((err) => {
  console.error("[M6.2] audit fatal:", err);
  process.exit(1);
});
