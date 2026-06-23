/**
 * M6.1 — Paridad Financial Items vs TN / allocations
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

function num(v: unknown): number {
  if (v == null) return 0;
  return Number(v);
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
      tnTotalAgg,
      tnCount,
      allocAgg,
      unitCount,
      unitWithAllocCount,
      fiTnCount,
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
      prisma.tnOrder.aggregate({ _sum: { tnTotal: true } }),
      prisma.tnOrder.count(),
      prisma.tnOrderItemAllocation.aggregate({
        _sum: {
          grossUnitAmount: true,
          discountAllocated: true,
          feeAllocated: true,
          mpTotalCostAllocatedReal: true,
          shippingAllocated: true,
          netoPrenda: true,
          netoPrendaReal: true,
        },
      }),
      prisma.tnOrderItemUnit.count(),
      prisma.tnOrderItemUnit.count({ where: { allocation: { isNot: null } } }),
      prisma.financialItem.count(),
    ]);

    const allocNetCoalesce = await prisma.$queryRaw<
      [{ net_coalesce: string | null }]
    >`
      SELECT SUM(COALESCE(neto_prenda_real, neto_prenda)) AS net_coalesce
      FROM tn_order_item_allocations
    `;
    const allocNetEffective = num(allocNetCoalesce[0]?.net_coalesce);

    const fi = {
      count: fiCount,
      gross: num(fiAgg._sum.grossAmount),
      discount: num(fiAgg._sum.discountAllocated),
      tnFee: num(fiAgg._sum.tnFeeAllocated),
      mpFee: num(fiAgg._sum.mpFeeAllocated),
      shipping: num(fiAgg._sum.shippingAllocated),
      net: num(fiAgg._sum.netAmount),
    };

    const allocations = {
      count: unitWithAllocCount,
      gross: num(allocAgg._sum.grossUnitAmount),
      discount: num(allocAgg._sum.discountAllocated),
      tnFee: num(allocAgg._sum.feeAllocated),
      mpFee: num(allocAgg._sum.mpTotalCostAllocatedReal),
      shipping: num(allocAgg._sum.shippingAllocated),
      net: num(allocAgg._sum.netoPrenda),
      netEffective: allocNetEffective,
    };

    const tnOrders = {
      count: tnCount,
      tnTotalSum: num(tnTotalAgg._sum.tnTotal),
    };

    const parity = {
      grossVsAllocGross: fi.gross - allocations.gross,
      discountVsAlloc: fi.discount - allocations.discount,
      tnFeeVsAlloc: fi.tnFee - allocations.tnFee,
      mpFeeVsAllocMpTotal: fi.mpFee - allocations.mpFee,
      shippingVsAlloc: fi.shipping - allocations.shipping,
      netVsAllocNetEffective: fi.net - allocNetEffective,
      netVsAllocNetoPrenda: fi.net - allocations.net,
      grossVsTnTotal: fi.gross - tnOrders.tnTotalSum,
      itemCountVsUnitsWithAlloc: fi.count - unitWithAllocCount,
    };

    const report = {
      generatedAt: new Date().toISOString(),
      financialItems: fi,
      allocations,
      tnOrders,
      units: { total: unitCount, withAllocation: unitWithAllocCount },
      parity,
      notes: [
        "fi.gross vs tn_orders.tn_total difiere por grain (cabecera vs unidad) y shipping cabecera.",
        "fi.* vs allocations.* debe acercarse a 0 post-backfill completo.",
        `financial_items total rows (all origins): ${fiTnCount}`,
      ],
      pass:
        Math.abs(parity.grossVsAllocGross) < 1 &&
        Math.abs(parity.discountVsAlloc) < 1 &&
        Math.abs(parity.netVsAllocNetEffective) < 1 &&
        Math.abs(parity.itemCountVsUnitsWithAlloc) <= 6,
    };

    fs.mkdirSync(WIP, { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

    console.log(JSON.stringify(report, null, 2));
    console.log(`[M6.1] audit report → ${REPORT_PATH}`);

    if (!report.pass) process.exitCode = 1;
  } finally {
    await disconnectPrisma(client);
  }
}

main().catch((err) => {
  console.error("[M6.1] audit fatal:", err);
  process.exit(1);
});
