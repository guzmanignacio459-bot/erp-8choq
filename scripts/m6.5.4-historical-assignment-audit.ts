/**
 * M6.5.4 — Historical transfer assignment audit + simulation (read-only)
 *
 *   npm run m6.5.4:historical:audit
 */
import fs from "fs";
import path from "path";

import type { PrismaClient, TnOrder } from "@prisma/client";

import {
  artCalendarDayKey,
  artRangeBoundsMs,
  isInstantInArtRange,
} from "../lib/erp/art-date";
import { computeNetReal } from "../lib/financial-items/compute-net-real";
import {
  allocateTransferFeeToUnits,
  computeTransferFeeOrder,
} from "../lib/financial-items/transfer-fee-allocation";
import { isTnTransferOrder } from "../lib/financial-accounts/is-tn-transfer-order";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { loadEnvLocal } = require("./lib/l0-env.mjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createPrisma, disconnectPrisma } = require("./lib/l1-prisma.mjs");

loadEnvLocal();

const WIP = path.join(process.cwd(), "_wip");
const REPORT_PATH = path.join(WIP, "m6.5.4-historical-assignment-audit-report.json");

const JUNE_FROM = "2026-06-01";
const JUNE_TO = "2026-06-30";

/** Reglas históricas M6.5.4 (fechas ART inclusive). */
const HISTORICAL_RULES: Array<{
  from: string;
  to: string;
  accountName: string;
  ratePercent: number;
}> = [
  { from: "2026-06-03", to: "2026-06-05", accountName: "Galicia", ratePercent: 5 },
  { from: "2026-06-06", to: "2026-06-08", accountName: "Ignacio", ratePercent: 0 },
  { from: "2026-06-09", to: "2026-06-09", accountName: "Serbertex", ratePercent: 0 },
  { from: "2026-06-10", to: "2026-06-10", accountName: "Galicia", ratePercent: 5 },
  { from: "2026-06-11", to: "2026-06-11", accountName: "Serbertex", ratePercent: 0 },
  { from: "2026-06-12", to: "2026-06-15", accountName: "Galicia", ratePercent: 5 },
  { from: "2026-06-16", to: "2026-06-23", accountName: "Lucia", ratePercent: 0 },
  { from: "2026-06-24", to: "2026-06-26", accountName: "Galicia", ratePercent: 5 },
  { from: "2026-06-27", to: "2026-06-27", accountName: "Ignacio", ratePercent: 0 },
  { from: "2026-06-28", to: "2026-06-28", accountName: "Galicia", ratePercent: 5 },
  { from: "2026-06-29", to: "2026-06-29", accountName: "Ignacio", ratePercent: 0 },
];

type TransferRow = Pick<
  TnOrder,
  "id" | "tnPaidAt" | "tnTotal" | "paymentGateway" | "paymentMethod" | "rawTnPayload"
> & {
  artPaidDay: string;
  customerName: string | null;
};

function resolveHistoricalAccount(
  artPaidDay: string,
  paidMs: number
): (typeof HISTORICAL_RULES)[number] | null {
  for (const rule of HISTORICAL_RULES) {
    if (isInstantInArtRange(paidMs, rule.from, rule.to)) return rule;
  }
  return null;
}

function periodLabel(rule: (typeof HISTORICAL_RULES)[number]): string {
  return `${rule.from} → ${rule.to} · ${rule.accountName}`;
}

async function main() {
  if (!(process.env.DATABASE_URL ?? "").includes("neon.tech")) {
    throw new Error("DATABASE_URL Neon staging required");
  }

  const client = createPrisma();
  const prisma = client.prisma as PrismaClient;

  try {
    const juneBounds = artRangeBoundsMs(JUNE_FROM, JUNE_TO);
    if (!juneBounds) throw new Error("Invalid June bounds");

    const accounts = await prisma.financialAccount.findMany({
      select: { id: true, name: true, ratePercent: true, isActive: true },
      orderBy: { name: "asc" },
    });
    const accountByName = new Map(accounts.map((a) => [a.name, a]));

    const paidOrders: Pick<
      TnOrder,
      | "id"
      | "tnPaidAt"
      | "tnTotal"
      | "paymentGateway"
      | "paymentMethod"
      | "rawTnPayload"
      | "customerName"
    >[] = await prisma.tnOrder.findMany({
      where: {
        tnPaidAt: {
          gte: new Date(juneBounds.startMs),
          lte: new Date(juneBounds.endMs),
        },
      },
      select: {
        id: true,
        tnPaidAt: true,
        tnTotal: true,
        paymentGateway: true,
        paymentMethod: true,
        rawTnPayload: true,
        customerName: true,
      },
    });

    const transfers: TransferRow[] = paidOrders
      .filter(isTnTransferOrder)
      .map((o) => ({
        ...o,
        artPaidDay: artCalendarDayKey(o.tnPaidAt!.getTime()),
      }));

    const assignments = await prisma.financialAccountAssignment.findMany({
      where: {
        originType: "TN_ORDER",
        originId: { in: transfers.map((t) => t.id) },
      },
      include: { account: { select: { id: true, name: true, ratePercent: true } } },
    });
    const assignmentByOrder = new Map(assignments.map((a) => [a.originId, a]));

    const fiByOrder = await prisma.financialItem.groupBy({
      by: ["originId"],
      where: {
        originType: "TN_ORDER",
        originId: { in: transfers.map((t) => t.id) },
      },
      _sum: {
        grossAmount: true,
        transferFeeAllocated: true,
        netAmount: true,
      },
      _count: { id: true },
    });
    const fiAggByOrder = new Map(fiByOrder.map((r) => [r.originId, r]));

    const fiItems = await prisma.financialItem.findMany({
      where: {
        originType: "TN_ORDER",
        originId: { in: transfers.map((t) => t.id) },
      },
      select: {
        originId: true,
        unitKey: true,
        grossAmount: true,
        discountAllocated: true,
        tnFeeAllocated: true,
        mpFeeAllocated: true,
        shippingAllocated: true,
        transferFeeAllocated: true,
        netAmount: true,
      },
    });
    const fiItemsByOrder = new Map<string, typeof fiItems>();
    for (const fi of fiItems) {
      const list = fiItemsByOrder.get(fi.originId) ?? [];
      list.push(fi);
      fiItemsByOrder.set(fi.originId, list);
    }

    // --- Phase 1: Audit by historical period ---
    type PeriodAgg = {
      period: string;
      accountName: string;
      from: string;
      to: string;
      orders: number;
      facturacion: number;
      orderIds: string[];
    };

    const periodMap = new Map<string, PeriodAgg>();
    const unmapped: TransferRow[] = [];

    for (const t of transfers) {
      const paidMs = t.tnPaidAt!.getTime();
      const rule = resolveHistoricalAccount(t.artPaidDay, paidMs);
      if (!rule) {
        unmapped.push(t);
        continue;
      }
      const key = periodLabel(rule);
      const agg = periodMap.get(key) ?? {
        period: key,
        accountName: rule.accountName,
        from: rule.from,
        to: rule.to,
        orders: 0,
        facturacion: 0,
        orderIds: [],
      };
      agg.orders++;
      agg.facturacion += Number(t.tnTotal);
      agg.orderIds.push(t.id);
      periodMap.set(key, agg);
    }

    const periodAudit = [...periodMap.values()].sort((a, b) =>
      a.from.localeCompare(b.from)
    );
    const mappedOrders = periodAudit.reduce((s, p) => s + p.orders, 0);
    const mappedFacturacion = periodAudit.reduce((s, p) => s + p.facturacion, 0);
    const juneFacturacion = transfers.reduce((s, t) => s + Number(t.tnTotal), 0);

    // --- Phase 2: Simulation aggregated by target account ---
    type AccountSim = {
      accountName: string;
      ratePercent: number;
      orders: number;
      transferFeeSimulated: number;
      transferFeeCurrent: number;
      netRealCurrent: number;
      netRealSimulated: number;
      reassignmentCount: number;
      orderIds: string[];
    };

    const simByAccount = new Map<string, AccountSim>();
    const risks = {
      ordersOutsidePeriod: unmapped.map((t) => ({
        tnOrder: t.id,
        artPaidDay: t.artPaidDay,
        facturacion: Number(t.tnTotal),
        customer: t.customerName,
        hasAssignment: assignmentByOrder.has(t.id),
        currentAccount: assignmentByOrder.get(t.id)?.account.name ?? null,
      })),
      ordersWithoutAssignment: [] as Array<{
        tnOrder: string;
        artPaidDay: string;
        facturacion: number;
      }>,
      snapshotConflicts: [] as Array<{
        tnOrder: string;
        artPaidDay: string;
        historicalAccount: string;
        historicalRate: number;
        currentAccount: string;
        currentRate: number;
        assignedAt: string;
      }>,
      transferFeeDeltas: [] as Array<{
        tnOrder: string;
        currentTf: number;
        simulatedTf: number;
        delta: number;
      }>,
      missingAccounts: [] as string[],
    };

    let totalTfCurrent = 0;
    let totalTfSimulated = 0;
    let totalNetCurrent = 0;
    let totalNetSimulated = 0;

    for (const t of transfers) {
      const paidMs = t.tnPaidAt!.getTime();
      const rule = resolveHistoricalAccount(t.artPaidDay, paidMs);
      const currentAssign = assignmentByOrder.get(t.id);

      if (!currentAssign) {
        risks.ordersWithoutAssignment.push({
          tnOrder: t.id,
          artPaidDay: t.artPaidDay,
          facturacion: Number(t.tnTotal),
        });
      }

      if (!rule) continue;

      if (!accountByName.has(rule.accountName)) {
        if (!risks.missingAccounts.includes(rule.accountName)) {
          risks.missingAccounts.push(rule.accountName);
        }
      }

      const simulatedRate = rule.ratePercent;
      const simulatedTf = computeTransferFeeOrder(Number(t.tnTotal), simulatedRate);

      const fiAgg = fiAggByOrder.get(t.id);
      const currentTf = Number(fiAgg?._sum.transferFeeAllocated ?? 0);
      const currentNet = Number(fiAgg?._sum.netAmount ?? 0);

      totalTfCurrent += currentTf;
      totalTfSimulated += simulatedTf;

      if (currentAssign) {
        const curName = currentAssign.account.name;
        const curRate = Number(currentAssign.ratePercentSnapshot);
        if (curName !== rule.accountName || curRate !== simulatedRate) {
          risks.snapshotConflicts.push({
            tnOrder: t.id,
            artPaidDay: t.artPaidDay,
            historicalAccount: rule.accountName,
            historicalRate: simulatedRate,
            currentAccount: curName,
            currentRate: curRate,
            assignedAt: currentAssign.assignedAt.toISOString(),
          });
        }
      }

      if (Math.abs(currentTf - simulatedTf) > 0.01) {
        risks.transferFeeDeltas.push({
          tnOrder: t.id,
          currentTf,
          simulatedTf,
          delta: simulatedTf - currentTf,
        });
      }

      // Net real per order from FI line items
      const lines = fiItemsByOrder.get(t.id) ?? [];
      let orderNetSim = 0;
      if (lines.length) {
        const units = lines.map((fi) => ({
          unitKey: fi.unitKey,
          grossAmount: Number(fi.grossAmount),
        }));
        const tfParts = allocateTransferFeeToUnits(simulatedTf, units);
        const tfByUnit = new Map(tfParts.map((p) => [p.unitKey, p.transferFeeAllocated]));
        for (const fi of lines) {
          const newTf = tfByUnit.get(fi.unitKey) ?? 0;
          orderNetSim += computeNetReal({
            grossAmount: Number(fi.grossAmount),
            discountAllocated: Number(fi.discountAllocated),
            tnFeeAllocated: Number(fi.tnFeeAllocated),
            mpFeeAllocated: Number(fi.mpFeeAllocated),
            shippingAllocated: Number(fi.shippingAllocated),
            transferFeeAllocated: newTf,
          });
        }
      } else {
        orderNetSim = currentNet;
      }

      totalNetCurrent += currentNet;
      totalNetSimulated += orderNetSim;

      const simKey = rule.accountName;
      const sim = simByAccount.get(simKey) ?? {
        accountName: rule.accountName,
        ratePercent: simulatedRate,
        orders: 0,
        transferFeeSimulated: 0,
        transferFeeCurrent: 0,
        netRealCurrent: 0,
        netRealSimulated: 0,
        reassignmentCount: 0,
        orderIds: [],
      };
      sim.orders++;
      sim.transferFeeSimulated += simulatedTf;
      sim.transferFeeCurrent += currentTf;
      sim.netRealCurrent += currentNet;
      sim.netRealSimulated += orderNetSim;
      if (currentAssign && currentAssign.account.name !== rule.accountName) {
        sim.reassignmentCount++;
      }
      sim.orderIds.push(t.id);
      simByAccount.set(simKey, sim);
    }

    // Current state by account (for reference)
    const currentByAccount = new Map<
      string,
      { orders: number; facturacion: number; transferFee: number }
    >();
    for (const t of transfers) {
      const a = assignmentByOrder.get(t.id);
      const name = a?.account.name ?? "(sin assignment)";
      const cur = currentByAccount.get(name) ?? {
        orders: 0,
        facturacion: 0,
        transferFee: 0,
      };
      cur.orders++;
      cur.facturacion += Number(t.tnTotal);
      cur.transferFee += Number(fiAggByOrder.get(t.id)?._sum.transferFeeAllocated ?? 0);
      currentByAccount.set(name, cur);
    }

    const simulationByAccount = [...simByAccount.values()].sort((a, b) =>
      a.accountName.localeCompare(b.accountName)
    );

    const report = {
      generatedAt: new Date().toISOString(),
      mode: "audit-only",
      timezone: "America/Argentina/Buenos_Aires",
      juneTransfers: {
        totalOrders: transfers.length,
        totalFacturacion: juneFacturacion,
      },
      phase1_audit: {
        byPeriod: periodAudit.map((p) => ({
          cuenta: p.accountName,
          periodo: `${p.from} → ${p.to}`,
          ordenes: p.orders,
          facturacion: round2(p.facturacion),
        })),
        mappedTotals: {
          ordenes: mappedOrders,
          facturacion: round2(mappedFacturacion),
        },
        unmappedOutsideRules: {
          ordenes: unmapped.length,
          facturacion: round2(
            unmapped.reduce((s, t) => s + Number(t.tnTotal), 0)
          ),
          orders: risks.ordersOutsidePeriod,
        },
        validation: {
          mappedPlusUnmappedEqualsJune:
            mappedOrders + unmapped.length === transfers.length,
          sumPeriodOrdersEqualsMapped: mappedOrders === transfers.length - unmapped.length,
        },
        currentAssignmentsByAccount: [...currentByAccount.entries()]
          .map(([cuenta, v]) => ({
            cuenta,
            ordenes: v.orders,
            facturacion: round2(v.facturacion),
            transferFee: round2(v.transferFee),
          }))
          .sort((a, b) => a.cuenta.localeCompare(b.cuenta)),
      },
      phase2_simulation: {
        byAccount: simulationByAccount.map((s) => ({
          cuenta: s.accountName,
          ratePercent: s.ratePercent,
          ordenes: s.orders,
          transferFeeSimulated: round2(s.transferFeeSimulated),
          transferFeeCurrent: round2(s.transferFeeCurrent),
          netRealCurrent: round2(s.netRealCurrent),
          netRealSimulated: round2(s.netRealSimulated),
          reassignmentsFromCurrent: s.reassignmentCount,
        })),
        totals: {
          transferFeeSimulated: round2(totalTfSimulated),
          transferFeeCurrent: round2(totalTfCurrent),
          transferFeeDelta: round2(totalTfSimulated - totalTfCurrent),
          netRealCurrent: round2(totalNetCurrent),
          netRealSimulated: round2(totalNetSimulated),
          netRealDelta: round2(totalNetSimulated - totalNetCurrent),
        },
        coversAllJuneInRules: unmapped.length === 0,
      },
      phase3_risks: {
        ...risks,
        snapshotConflictCount: risks.snapshotConflicts.length,
        transferFeeDeltaCount: risks.transferFeeDeltas.length,
        ordersWithoutAssignmentCount: risks.ordersWithoutAssignment.length,
        ordersOutsidePeriodCount: unmapped.length,
        missingAccounts: risks.missingAccounts,
      },
      accountsInDb: accounts.map((a) => ({
        name: a.name,
        ratePercent: Number(a.ratePercent),
        isActive: a.isActive,
      })),
      goNoGo: {
        go:
          risks.missingAccounts.length === 0 &&
          unmapped.length === 0,
        readyForWrite:
          risks.missingAccounts.length === 0 &&
          unmapped.length === 0,
        coveragePercent:
          transfers.length === 0
            ? 100
            : round2((mappedOrders / transfers.length) * 100),
        ordersWithoutAssignmentInDb: risks.ordersWithoutAssignment.length,
        ordersWithoutDestination: unmapped.length,
        blockers: [
          ...(risks.missingAccounts.length
            ? [`missing_accounts:${risks.missingAccounts.join(",")}`]
            : []),
          ...(unmapped.length
            ? [`orders_outside_period:${unmapped.length}`]
            : []),
        ],
      },
      writePlan: {
        status: "prepared-not-executed",
        steps: [
          "UPDATE financial_account_assignments (origin TN_ORDER, jun transfers) → cuenta histórica + ratePercentSnapshot",
          "Re-run applyTransferFeeForTnOrder per affected order",
          "Recalculate net_amount via computeNetReal (M6.5.3)",
          "Validate: 100% coverage, TF parity, net real parity",
        ],
        note: "Does NOT modify isActive on financial_accounts or pipeline automation",
      },
    };

    fs.mkdirSync(WIP, { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    console.log(`[M6.5.4] report → ${REPORT_PATH}`);
  } finally {
    await disconnectPrisma(client);
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

main().catch((err) => {
  console.error("[M6.5.4] fatal:", err);
  process.exit(1);
});
