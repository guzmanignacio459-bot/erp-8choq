#!/usr/bin/env node
/**
 * L1.1 — Verificación post-write DB staging
 */

import { loadEnvLocal } from "./lib/l0-env.mjs";
import { createPrisma, disconnectPrisma } from "./lib/l1-prisma.mjs";
import { inArtRange } from "./lib/l0-art-date.mjs";
import { L1_PERIODS } from "./lib/l1-periods.mjs";
import {
  tnInPeriodKpi,
} from "./lib/l1-tn-client.mjs";
import { erpInPeriodKpi } from "./lib/l1-erp-map.mjs";

loadEnvLocal();

const DRY_RUN_EXPECT = {
  abril: { tn: 359, erp: 359 },
  mayo: { tn: 468, erp: 464 },
  junio: { tn: 95, erp: 94 },
};

function maskUrl(url) {
  if (!url) return "(missing)";
  try {
    const u = new URL(url.replace(/^postgresql:/, "http:"));
    const host = u.hostname;
    const port = u.port || "5432";
    const db = u.pathname.replace(/^\//, "") || "postgres";
    const isNeon = host.includes("neon.tech");
    const isLocal =
      host === "127.0.0.1" || host === "localhost" || port === "5433";
    return {
      host,
      port,
      database: db,
      provider: isNeon ? "neon-staging" : isLocal ? "local-pglite" : "postgres-other",
      blockedProd: false,
    };
  } catch {
    return { provider: "unknown", host: "masked" };
  }
}

async function main() {
  const db = createPrisma();
  const prisma = db.prisma;
  try {
    const urlMeta = maskUrl(process.env.DATABASE_URL);
    console.log("[L1 verify] DATABASE_URL meta:", JSON.stringify(urlMeta));

    const counts = {
      tnOrders: await prisma.tnOrder.count(),
      tnOrderItems: await prisma.tnOrderItem.count(),
      erpOrders: await prisma.erpOrder.count(),
      erpOrderItems: await prisma.erpOrderItem.count(),
      payments: await prisma.payment.count(),
      customers: await prisma.customer.count(),
    };
    console.log("[L1 verify] counts:", counts);

    const reconGlobal = await prisma.erpOrder.groupBy({
      by: ["reconciliationStatus"],
      _count: { _all: true },
    });
    console.log("[L1 verify] reconciliation_status global:", reconGlobal);

    const tnRows = await prisma.tnOrder.findMany({
      select: {
        id: true,
        tnTotal: true,
        tnPaidAt: true,
        tnCreatedAt: true,
        tnAnalyticsCounted: true,
        tnPaymentStatus: true,
      },
    });
    const erpRows = await prisma.erpOrder.findMany({
      select: {
        id: true,
        tnOrderId: true,
        fechaErp: true,
        totalFinalErp: true,
        reconciliationStatus: true,
      },
    });

    const tnMapped = tnRows.map((r) => ({
      id: r.id,
      tnTotal: Number(r.tnTotal),
      paidAtIso: r.tnPaidAt?.toISOString() ?? null,
      tnCreatedAt: r.tnCreatedAt,
      tnAnalyticsCounted: r.tnAnalyticsCounted,
    }));
    const erpMapped = erpRows.map((r) => ({
      id: r.id,
      tnOrderId: r.tnOrderId,
      fecha: r.fechaErp?.toISOString() ?? null,
      fechaErp: r.fechaErp?.toISOString() ?? null,
      totalFinalErp: Number(r.totalFinalErp),
    }));

    const periods = [];
    for (const p of L1_PERIODS) {
      const tnIn = tnMapped.filter((t) => tnInPeriodKpi(t, p.from, p.to));
      const erpIn = erpMapped.filter((e) => erpInPeriodKpi(e, p.from, p.to));
      const tnFact = tnIn.reduce((s, t) => s + t.tnTotal, 0);
      const erpFact = erpIn.reduce((s, e) => s + e.totalFinalErp, 0);
      const recon = await prisma.erpOrder.groupBy({
        by: ["reconciliationStatus"],
        where: {
          fechaErp: {
            gte: new Date(`${p.from}T00:00:00-03:00`),
            lte: new Date(`${p.to}T23:59:59-03:00`),
          },
        },
        _count: { _all: true },
      });
      const exp = DRY_RUN_EXPECT[p.key];
      periods.push({
        key: p.key,
        tnOrders: tnIn.length,
        erpOrders: erpIn.length,
        tnFacturacion: Math.round(tnFact * 100) / 100,
        erpFacturacion: Math.round(erpFact * 100) / 100,
        expected: exp,
        matchTn: tnIn.length === exp.tn,
        matchErp: erpIn.length === exp.erp,
        reconciliation: recon,
      });
    }

    console.log("\n[L1 verify] periods vs dry-run:");
    for (const p of periods) {
      const iconTn = p.matchTn ? "✓" : "✗";
      const iconErp = p.matchErp ? "✓" : "✗";
      console.log(
        `  ${p.key}: TN ${iconTn} ${p.tnOrders}/${p.expected.tn} | ERP ${iconErp} ${p.erpOrders}/${p.expected.erp}`
      );
    }

    const out = {
      generatedAt: new Date().toISOString(),
      urlMeta,
      counts,
      reconciliationGlobal: reconGlobal,
      periods,
      allMatch: periods.every((p) => p.matchTn && p.matchErp),
    };

    const fs = await import("fs");
    const path = await import("path");
    const outPath = path.join("_wip", "l1-verify-db.json");
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
    console.log(`\n[L1 verify] wrote ${outPath}`);
  } finally {
    await disconnectPrisma(db);
  }
}

main().catch((e) => {
  console.error("[L1 verify] FAIL:", e.message);
  process.exit(1);
});
