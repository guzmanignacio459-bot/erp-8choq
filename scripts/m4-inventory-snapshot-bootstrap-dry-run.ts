/**
 * M4.8b / M4.8b.2 — Bootstrap dry-run STOCK MAESTRO → snapshot draft (sin writes Neon)
 */
import fs from "fs";
import path from "path";

import {
  auditStockMaestroHeaders,
  readStockMaestroFromSheets,
} from "../lib/erp/v2/read-stock-maestro";
import { unpivotStockMaestro } from "../lib/erp/v2/unpivot-stock-maestro";
import { validateSnapshotDraft } from "../lib/erp/v2/validate-inventory-snapshot-draft";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { loadEnvLocal } = require("./lib/l0-env.mjs");

const WIP = path.join(process.cwd(), "_wip");
const REPORT_PATH = path.join(WIP, "m4-inventory-snapshot-bootstrap-dry-run.json");

loadEnvLocal();

async function main() {
  const fetchedAt = new Date().toISOString();
  const proposedSnapshotDate = process.env.M4_8_SNAPSHOT_T0 ?? fetchedAt;
  const milestone = "M4.8b.2";

  console.log(`[${milestone}] read-only STOCK MAESTRO bootstrap dry-run`);
  console.log(`[${milestone}] proposed T0 (draft only):`, proposedSnapshotDate);

  const sheet = await readStockMaestroFromSheets();
  const headerAudit = auditStockMaestroHeaders(sheet.headers);

  const draft = unpivotStockMaestro(sheet.sourceRows, {
    includeZeroQty: true,
    proposedSnapshotDate,
    label: `bootstrap-draft-${proposedSnapshotDate.slice(0, 10)}`,
    normalizeEmbeddedTalle: true,
    dedupeKeys: true,
  });

  const validation = validateSnapshotDraft(draft);

  const report = {
    generatedAt: fetchedAt,
    milestone,
    mode: "dry-run",
    normalization: {
      embeddedTalle: true,
      dedupeKeys: true,
      dedupePolicy: "last_source_row_wins",
    },
    writes: false,
    neon: false,
    stockMovementsTouched: false,
    source: {
      sheetName: sheet.sheetName,
      fetchedAt: sheet.fetchedAt,
      headerAudit,
      sourceRowCount: sheet.sourceRows.length,
    },
    draft: {
      proposedSnapshotDate: draft.proposedSnapshotDate,
      label: draft.label,
      source: draft.source,
      checksumSha256: draft.checksumSha256,
      stats: draft.stats,
    },
    exclusions: draft.exclusions,
    warnings: draft.warnings,
    validation: {
      allPass: validation.allPass,
      vI1: validation.vI1,
      vI2: validation.vI2,
      manualReviewWarnings: validation.manualReviewWarnings,
    },
    remainingDuplicates: validation.vI1.duplicates,
    risks: buildRisks(draft, validation, headerAudit),
    sampleLines: draft.lines.filter((l) => l.quantity > 0).slice(0, 10),
  };

  if (!fs.existsSync(WIP)) fs.mkdirSync(WIP, { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

  console.log(`[${milestone}] source rows:`, draft.stats.sourceRows);
  console.log(`[${milestone}] eligible rows:`, draft.stats.eligibleSourceRows);
  console.log(`[${milestone}] excluded rows:`, draft.stats.excludedRows);
  console.log(`[${milestone}] embedded talle rows:`, draft.stats.embeddedTalleRows);
  console.log(`[${milestone}] raw lines pre-dedupe:`, draft.stats.rawLinesBeforeDedupe);
  console.log(`[${milestone}] deduped merged:`, draft.stats.dedupedLinesMerged);
  console.log(`[${milestone}] destination lines:`, draft.stats.destinationLines);
  console.log(`[${milestone}] unique snapshot keys:`, draft.stats.uniqueSnapshotKeys);
  console.log(`[${milestone}] checksum:`, draft.checksumSha256);
  console.log(`[${milestone}] V-I1:`, validation.vI1.pass ? "PASS" : "FAIL");
  console.log(`[${milestone}] V-I2:`, validation.vI2.pass ? "PASS" : "FAIL");
  console.log(`[${milestone}] manual review warnings:`, validation.manualReviewWarnings.length);
  console.log(`[${milestone}] report:`, REPORT_PATH);

  if (!validation.allPass) {
    process.exitCode = 1;
  }
}

function buildRisks(
  draft: ReturnType<typeof unpivotStockMaestro>,
  validation: ReturnType<typeof validateSnapshotDraft>,
  headerAudit: ReturnType<typeof auditStockMaestroHeaders>
): string[] {
  const risks: string[] = [];

  if (headerAudit.missingSizes.length) {
    risks.push(`Columnas talle ausentes: ${headerAudit.missingSizes.join(", ")}`);
  }
  if (!validation.vI1.pass) {
    risks.push(
      `V-I1 FAIL — ${validation.vI1.duplicateCount} keys duplicadas remanentes post-normalización`
    );
  }
  if (!validation.vI2.pass) {
    risks.push("V-I2 FAIL — SKU/talle/owner inválidos en líneas destino");
  }
  if (draft.stats.dedupedLinesMerged > 0) {
    risks.push(
      `${draft.stats.dedupedLinesMerged} líneas fusionadas por dedupe last_row_wins — verificar cantidades`
    );
  }
  if (validation.manualReviewWarnings.length) {
    risks.push(
      `${validation.manualReviewWarnings.length} fila(s) manual_review_required excluidas con warning audit-only`
    );
  }
  if (draft.stats.excludedSyncArtifactRows > 0) {
    risks.push(
      `${draft.stats.excludedSyncArtifactRows} filas sync artifact excluidas del bootstrap`
    );
  }
  risks.push("T0 no declarado — pendiente M4.8c tras PASS estable");
  risks.push(
    "101 stock_movements piloto — coordinar created_at >= T0 al import real"
  );

  return risks;
}

main().catch((err) => {
  console.error("[M4.8b.2] fatal:", err);
  process.exit(1);
});
