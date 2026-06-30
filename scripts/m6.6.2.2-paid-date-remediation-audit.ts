/**
 * M6.6.2.2 — Paid date historical remediation audit (read-only)
 *
 *   npm run m6.6.2.2:paid-date:audit
 *   npm run m6.6.2.2:paid-date:audit -- --full   # all gap orders via TN detail
 */
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
const REPORT_PATH = path.join(WIP, "m6.6.2.2-paid-date-remediation-audit-report.json");

const GAP_WHERE = `
  o.tn_payment_status = 'paid'
  AND o.tn_paid_at IS NULL
`;

const TRANSFER_WHERE = `
  ${GAP_WHERE}
  AND LOWER(COALESCE(o.payment_gateway, '')) NOT IN ('mercado-pago', 'mercadopago')
  AND NOT (LOWER(COALESCE(o.raw_tn_payload->>'gateway', '')) LIKE '%mercado%')
  AND (
    UPPER(TRIM(COALESCE(o.payment_method, ''))) = 'TRANSFERENCIA'
    OR LOWER(COALESCE(o.raw_tn_payload->>'gateway_name', '')) LIKE '%transfer%'
    OR LOWER(COALESCE(o.raw_tn_payload->>'gateway_name', '')) LIKE '%transferencia%'
    OR LOWER(COALESCE(o.raw_tn_payload->>'gateway_name', '')) LIKE '%depósito%'
    OR LOWER(COALESCE(o.raw_tn_payload->>'gateway_name', '')) LIKE '%deposito%'
    OR LOWER(COALESCE(o.raw_tn_payload->>'gateway_name', '')) LIKE '%bancario%'
  )
`;

type GapRow = {
  id: string;
  tnPaymentStatus: string | null;
  paymentGateway: string | null;
  paymentMethod: string | null;
  rawTnPayload: unknown;
  tnTotal: unknown;
  tnCreatedAt: Date | null;
};

function isMercadoPago(row: GapRow): boolean {
  const pg = String(row.paymentGateway ?? "").toLowerCase();
  if (pg === "mercado-pago" || pg.includes("mercado")) return true;
  const raw = row.rawTnPayload as Record<string, unknown> | null;
  const gateway = String(raw?.gateway ?? "").toLowerCase();
  return gateway.includes("mercado");
}

function hasDetailPaidAt(raw: Record<string, unknown> | null): boolean {
  const v = raw?.paid_at;
  return v != null && v !== "";
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function pickStratifiedSample(rows: GapRow[], n: number): GapRow[] {
  const transfer = rows.filter((r) => isTnTransferOrder(r));
  const mp = rows.filter((r) => isMercadoPago(r));
  const other = rows.filter((r) => !isTnTransferOrder(r) && !isMercadoPago(r));

  const perBucket = Math.floor(n / 3);
  const shuffle = <T,>(a: T[]) => [...a].sort(() => Math.random() - 0.5);

  const picked = [
    ...shuffle(transfer).slice(0, perBucket + (n % 3 > 0 ? 1 : 0)),
    ...shuffle(mp).slice(0, perBucket + (n % 3 > 1 ? 1 : 0)),
    ...shuffle(other).slice(0, perBucket),
  ];

  const seen = new Set<string>();
  const out: GapRow[] = [];
  for (const r of shuffle([...picked, ...shuffle(rows)])) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
    if (out.length >= n) break;
  }
  return out;
}

async function fetchDetailPaidAt(
  id: string,
  throttleMs: number
): Promise<{
  ok: boolean;
  payment_status: string | null;
  detail_paid_at: string | null;
  error?: string;
}> {
  await sleep(throttleMs);
  try {
    const raw = await fetchTnOrderById(id);
    if (!raw) {
      return { ok: false, payment_status: null, detail_paid_at: null, error: "not_found" };
    }
    const ps = raw.payment_status != null ? String(raw.payment_status) : null;
    const pa = hasDetailPaidAt(raw as Record<string, unknown>)
      ? String((raw as Record<string, unknown>).paid_at)
      : null;
    return { ok: true, payment_status: ps, detail_paid_at: pa };
  } catch (err) {
    return {
      ok: false,
      payment_status: null,
      detail_paid_at: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main() {
  const full = process.argv.includes("--full");
  const throttleMs = full ? 120 : 150;

  const client = createPrisma();
  const { prisma } = client;

  try {
    const gapRows = await prisma.tnOrder.findMany({
      where: { tnPaymentStatus: "paid", tnPaidAt: null },
      select: {
        id: true,
        tnPaymentStatus: true,
        paymentGateway: true,
        paymentMethod: true,
        rawTnPayload: true,
        tnTotal: true,
        tnCreatedAt: true,
      },
    });

    const transferIds = new Set(
      gapRows.filter((r) => isTnTransferOrder(r)).map((r) => r.id)
    );
    const mpIds = new Set(gapRows.filter((r) => isMercadoPago(r)).map((r) => r.id));

    const sample50 = pickStratifiedSample(gapRows as GapRow[], 50);
    const sampleResults = [];

    for (const row of sample50) {
      const detail = await fetchDetailPaidAt(row.id, throttleMs);
      sampleResults.push({
        orden: row.id,
        tipo: transferIds.has(row.id)
          ? "transfer"
          : mpIds.has(row.id)
            ? "mp"
            : "other",
        payment_status: detail.payment_status ?? row.tnPaymentStatus,
        detail_paid_at: detail.detail_paid_at,
        db_tn_paid_at: null as null,
        recoverable: detail.detail_paid_at != null,
        tn_created_at: row.tnCreatedAt?.toISOString() ?? null,
        api_ok: detail.ok,
        error: detail.error ?? null,
      });
    }

    const sampleRecoverable = sampleResults.filter((r) => r.recoverable).length;
    const sampleRecoveryRate = sampleRecoverable / sampleResults.length;

    // Phase 3 — full or extrapolated
    const toAnalyze = full ? gapRows : gapRows;
    let analyzed = 0;
    let recoverable = 0;
    let notRecoverable = 0;
    let transferRecoverable = 0;
    let mpRecoverable = 0;
    let apiErrors = 0;
    const notRecoverableIds: string[] = [];

    if (full) {
      for (const row of gapRows) {
        const detail = await fetchDetailPaidAt(row.id, throttleMs);
        analyzed++;
        if (!detail.ok) {
          apiErrors++;
          notRecoverable++;
          if (notRecoverableIds.length < 20) notRecoverableIds.push(row.id);
          continue;
        }
        if (detail.detail_paid_at) {
          recoverable++;
          if (transferIds.has(row.id)) transferRecoverable++;
          if (mpIds.has(row.id)) mpRecoverable++;
        } else {
          notRecoverable++;
          if (notRecoverableIds.length < 20) notRecoverableIds.push(row.id);
        }
      }
    } else {
      analyzed = gapRows.length;
      recoverable = Math.round(gapRows.length * sampleRecoveryRate);
      notRecoverable = analyzed - recoverable;
      transferRecoverable = Math.round(transferIds.size * sampleRecoveryRate);
      mpRecoverable = Math.round(mpIds.size * sampleRecoveryRate);
    }

    // Phase 4 — impact from DB (static, no writes)
    const impactRows = await prisma.$queryRawUnsafe<Array<{
      con_assignment: number;
      sin_assignment: number;
      transfer_sin_assignment: number;
      con_fi: number;
      tf: number;
      net_real: number;
      facturacion_transfer: number;
    }>>(`
      SELECT
        COUNT(DISTINCT fa.origin_id)::int AS con_assignment,
        COUNT(DISTINCT o.id) FILTER (WHERE fa.id IS NULL)::int AS sin_assignment,
        COUNT(DISTINCT o.id) FILTER (
          WHERE fa.id IS NULL AND (${TRANSFER_WHERE.replace(/\n/g, " ")})
        )::int AS transfer_sin_assignment,
        COUNT(DISTINCT fi.origin_id)::int AS con_fi,
        COALESCE(SUM(fi.transfer_fee_allocated),0)::float AS tf,
        COALESCE(SUM(fi.net_amount),0)::float AS net_real,
        COALESCE(SUM(o.tn_total) FILTER (WHERE (${TRANSFER_WHERE.replace(/\n/g, " ")})),0)::float AS facturacion_transfer
      FROM tn_orders o
      LEFT JOIN financial_account_assignments fa ON fa.origin_type='TN_ORDER' AND fa.origin_id=o.id
      LEFT JOIN financial_items fi ON fi.origin_type='TN_ORDER' AND fi.origin_id=o.id
      WHERE ${GAP_WHERE}
    `);

    const imp = impactRows[0]!;
    const recoveryRate = full
      ? recoverable / analyzed
      : sampleRecoveryRate;

    const report = {
      generatedAt: new Date().toISOString(),
      mode: full ? "full_api_scan" : "sample_extrapolation",
      hallazgo: {
        gapTotal: gapRows.length,
        transferGap: transferIds.size,
        mpGap: mpIds.size,
        sampleSize: sampleResults.length,
        sampleRecoveryRate: round(sampleRecoveryRate * 100) + "%",
        fullRecoveryRate: full ? round(recoveryRate * 100) + "%" : null,
      },
      fase1_sample50: sampleResults,
      fase2_design: {
        source: "GET /orders/{id}",
        updateFields: ["tn_paid_at", "raw_tn_payload.paid_at"],
        condition:
          "db.tn_paid_at IS NULL AND detail.paid_at IS NOT NULL",
        preserve:
          "No tocar assignments, TF, net real, FA; solo fechas en tn_orders",
        mergeRule:
          "tnPaidAt = parseDate(detail.paid_at); rawTnPayload = { ...existingRaw, paid_at: detail.paid_at }",
        throttle: "120-150ms between detail calls; batch por 100 ids",
        idempotent: true,
      },
      fase3_simulacion: {
        ordenesAnalizadas: analyzed,
        ordenesRecuperables: recoverable,
        noRecuperables: notRecoverable,
        transferenciasRecuperables: transferRecoverable,
        mpRecuperables: mpRecoverable,
        apiErrors: full ? apiErrors : null,
        notRecoverableSampleIds: full ? notRecoverableIds : null,
        extrapolated: !full,
      },
      fase4_impactoEsperado: {
        postRecoveryEligible: {
          assignmentPipelineTransfers:
            full && transferRecoverable > 0
              ? transferRecoverable
              : Math.round(transferIds.size * recoveryRate),
          currentlySinAssignment: imp.sin_assignment,
          transferSinAssignment: imp.transfer_sin_assignment,
          assignmentsRecuperablesEstimado: Math.round(
            imp.transfer_sin_assignment * recoveryRate
          ),
        },
        financialItems: {
          ordenesConFI: imp.con_fi,
          transferFeeActualGap: round(Number(imp.tf)),
          netRealActualGap: round(Number(imp.net_real)),
          nota:
            "TF/net real se recalculan en fases posteriores (M6.5.x); esta remediación solo habilita pipeline",
        },
        operatingBalance: {
          facturacionTransferGap: round(Number(imp.facturacion_transfer)),
          nota:
            "Saldo operativo depende de assignments; recovery de paid_at desbloquea asignación histórica",
        },
      },
      riesgos: [
        "Rate limit TN API en scan full (~1761 calls)",
        "Órdenes no recuperables requieren fallback (commercial_status_at) o revisión manual",
        "Remediación no recalcula TF/net sola — requiere pipeline post-fix",
        "Validar M6.6.2.1 deploy antes de write para no re-perder fechas",
      ],
      goNoGo: {
        auditRecovery: recoveryRate >= 0.9 ? "GO" : recoveryRate >= 0.7 ? "GO_WITH_WARNINGS" : "NO_GO",
        remediationWrite: "NO GO hasta deploy M6.6.2.1 confirmado",
        postRemediationPipeline: "GO después de write + validación spot",
      },
      pass: sampleRecoverable >= 45,
    };

    fs.mkdirSync(WIP, { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    console.error(`\nReport: ${REPORT_PATH}`);

    if (!report.pass && !full) {
      console.error("Sample recovery below threshold — re-run with --full");
    }
  } finally {
    await disconnectPrisma(client);
  }
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
