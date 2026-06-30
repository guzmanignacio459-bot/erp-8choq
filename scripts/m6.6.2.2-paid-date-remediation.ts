/**
 * M6.6.2.2 — Paid date historical remediation (TN detail → tn_paid_at)
 *
 *   npm run m6.6.2.2:paid-date:remediate
 *   npm run m6.6.2.2:paid-date:remediate -- --write
 */
import type { Prisma } from "@prisma/client";
import fs from "fs";
import path from "path";

import { fetchTnOrderById } from "../lib/erp/v2/tn-api-client";
import { isTnTransferOrder } from "../lib/financial-accounts/is-tn-transfer-order";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { loadEnvLocal } = require("./lib/l0-env.mjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createPrisma, disconnectPrisma } = require("./lib/l1-prisma.mjs");

loadEnvLocal();

const WIP = path.join(process.cwd(), "_wip");
const REPORT_PATH = path.join(WIP, "m6.6.2.2-paid-date-remediation-report.json");

const THROTTLE_MS = 130;

type GapRow = {
  id: string;
  tnPaidAt: Date | null;
  tnPaymentStatus: string | null;
  paymentGateway: string | null;
  paymentMethod: string | null;
  rawTnPayload: Prisma.JsonValue;
};

type GapCounts = {
  paidNullTotal: number;
  transferPaidNull: number;
};

function parsePaidAt(value: unknown): Date | null {
  if (value == null || value === "") return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function hasPaidAtValue(value: unknown): boolean {
  return value != null && value !== "";
}

function isMercadoPago(row: GapRow): boolean {
  const pg = String(row.paymentGateway ?? "").toLowerCase();
  if (pg === "mercado-pago" || pg.includes("mercado")) return true;
  const raw = row.rawTnPayload as Record<string, unknown> | null;
  return String(raw?.gateway ?? "").toLowerCase().includes("mercado");
}

function isTransferRow(row: GapRow): boolean {
  return isTnTransferOrder({
    paymentMethod: row.paymentMethod,
    paymentGateway: row.paymentGateway,
    rawTnPayload: row.rawTnPayload,
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function countGap(prisma: ReturnType<typeof createPrisma>["prisma"]): Promise<GapCounts> {
  const paidNullTotal = await prisma.tnOrder.count({
    where: { tnPaymentStatus: "paid", tnPaidAt: null },
  });

  const transferPaidNull = (await prisma.tnOrder.findMany({
    where: { tnPaymentStatus: "paid", tnPaidAt: null },
    select: {
      id: true,
      tnPaidAt: true,
      tnPaymentStatus: true,
      paymentGateway: true,
      paymentMethod: true,
      rawTnPayload: true,
    },
  })) as GapRow[];

  return {
    paidNullTotal,
    transferPaidNull: transferPaidNull.filter(isTransferRow).length,
  };
}

async function main() {
  const write = process.argv.includes("--write");

  if (!(process.env.DATABASE_URL ?? "").includes("neon.tech")) {
    throw new Error("DATABASE_URL Neon staging required");
  }

  const client = createPrisma();
  const { prisma } = client;

  const before = await countGap(prisma);

  const targets = (await prisma.tnOrder.findMany({
    where: { tnPaymentStatus: "paid", tnPaidAt: null },
    select: {
      id: true,
      tnPaidAt: true,
      tnPaymentStatus: true,
      paymentGateway: true,
      paymentMethod: true,
      rawTnPayload: true,
    },
    orderBy: { id: "asc" },
  })) as GapRow[];

  const stats = {
    target: targets.length,
    updated: 0,
    skipped: 0,
    apiErrors: 0,
    noPaidAtDetail: 0,
    transferUpdated: 0,
    mpUpdated: 0,
    otherUpdated: 0,
  };

  const samples: Array<{
    id: string;
    action: "would_update" | "updated" | "skipped" | "api_error" | "no_paid_at";
    detailPaidAt: string | null;
    segment: "transfer" | "mp" | "other";
  }> = [];

  const errors: string[] = [];

  for (const row of targets) {
    const segment: "transfer" | "mp" | "other" = isTransferRow(row)
      ? "transfer"
      : isMercadoPago(row)
        ? "mp"
        : "other";

    // Re-read guard — idempotent skip if already populated
    const fresh = await prisma.tnOrder.findUnique({
      where: { id: row.id },
      select: { tnPaidAt: true },
    });
    if (fresh?.tnPaidAt) {
      stats.skipped++;
      if (samples.length < 20) {
        samples.push({
          id: row.id,
          action: "skipped",
          detailPaidAt: null,
          segment,
        });
      }
      continue;
    }

    await sleep(THROTTLE_MS);

    let detailRaw: Record<string, unknown> | null = null;
    try {
      const raw = await fetchTnOrderById(row.id);
      if (!raw || typeof raw !== "object") {
        stats.apiErrors++;
        errors.push(`${row.id}: detail not found`);
        if (samples.length < 20) {
          samples.push({
            id: row.id,
            action: "api_error",
            detailPaidAt: null,
            segment,
          });
        }
        continue;
      }
      detailRaw = raw as Record<string, unknown>;
    } catch (err) {
      stats.apiErrors++;
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${row.id}: ${msg}`);
      if (samples.length < 20) {
        samples.push({
          id: row.id,
          action: "api_error",
          detailPaidAt: null,
          segment,
        });
      }
      continue;
    }

    if (!hasPaidAtValue(detailRaw.paid_at)) {
      stats.noPaidAtDetail++;
      if (samples.length < 20) {
        samples.push({
          id: row.id,
          action: "no_paid_at",
          detailPaidAt: null,
          segment,
        });
      }
      continue;
    }

    const paidAtIso = String(detailRaw.paid_at);
    const tnPaidAt = parsePaidAt(paidAtIso);
    if (!tnPaidAt) {
      stats.noPaidAtDetail++;
      errors.push(`${row.id}: invalid detail.paid_at=${paidAtIso}`);
      continue;
    }

    const existingRaw =
      row.rawTnPayload && typeof row.rawTnPayload === "object"
        ? (row.rawTnPayload as Record<string, unknown>)
        : {};
    const mergedRaw = { ...existingRaw, paid_at: paidAtIso };

    if (write) {
      await prisma.tnOrder.update({
        where: { id: row.id },
        data: {
          tnPaidAt,
          rawTnPayload: mergedRaw as Prisma.InputJsonValue,
        },
      });
      stats.updated++;
    } else {
      stats.updated++;
    }

    if (segment === "transfer") stats.transferUpdated++;
    else if (segment === "mp") stats.mpUpdated++;
    else stats.otherUpdated++;

    if (samples.length < 20) {
      samples.push({
        id: row.id,
        action: write ? "updated" : "would_update",
        detailPaidAt: paidAtIso,
        segment,
      });
    }
  }

  const after = write ? await countGap(prisma) : before;

  const report = {
    generatedAt: new Date().toISOString(),
    dryRun: !write,
    throttleMs: THROTTLE_MS,
    source: "GET /orders/{id}",
    writeSummary: {
      ordenesObjetivo: stats.target,
      actualizadas: stats.updated,
      skipped: stats.skipped,
      erroresApi: stats.apiErrors,
      sinPaidAtDetail: stats.noPaidAtDetail,
    },
    segmentos: {
      transferencias: stats.transferUpdated,
      mercadoPago: stats.mpUpdated,
      other: stats.otherUpdated,
    },
    dbPostCheck: {
      before: {
        paidTnPaidAtNull: before.paidNullTotal,
        transferPaidTnPaidAtNull: before.transferPaidNull,
      },
      after: {
        paidTnPaidAtNull: after.paidNullTotal,
        transferPaidTnPaidAtNull: after.transferPaidNull,
      },
    },
    samples,
    errors: errors.slice(0, 50),
    pass:
      stats.apiErrors === 0 &&
      stats.noPaidAtDetail === 0 &&
      stats.updated === stats.target - stats.skipped,
  };

  fs.mkdirSync(WIP, { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.error(`\nReport: ${REPORT_PATH}`);

  await disconnectPrisma(client);

  if (!report.pass && write) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
