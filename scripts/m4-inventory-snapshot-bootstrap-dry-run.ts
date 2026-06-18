/**
 * M4.8b — Bootstrap dry-run STOCK MAESTRO → snapshot draft (sin writes Neon)
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

  console.log("[M4.8b] read-only STOCK MAESTRO bootstrap dry-run");
  console.log("[M4.8b] proposed T0:", proposedSnapshotDate);

  const sheet = await readStockMaestroFromSheets();
  const headerAudit = auditStockMaestroHeaders(sheet.headers);

  const draft = unpivotStockMaestro(sheet.sourceRows, {
    includeZeroQty: true,
    proposedSnapshotDate,
    label: `bootstrap-draft-${proposedSnapshotDate.slice(0, 10)}`,
  });

  const validation = validateSnapshotDraft(draft, sheet.sourceRows);

  const report = {
    generatedAt: fetchedAt,
    milestone: "M4.8b",
    mode: "dry-run",
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
    validation: {
      allPass: validation.allPass,
      vI1: {
        ...validation.vI1,
        sourceSkuDuplicateSkuCount: validation.sourceSkuDuplicates.length,
      },
      vI2: validation.vI2,
      sourceSkuDuplicates: validation.sourceSkuDuplicates,
    },
    risks: buildRisks(draft, validation, headerAudit),
    sampleLines: draft.lines.filter((l) => l.quantity > 0).slice(0, 10),
  };

  if (!fs.existsSync(WIP)) fs.mkdirSync(WIP, { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

  console.log("[M4.8b] source rows:", sheet.sourceRows.length);
  console.log("[M4.8b] destination lines:", draft.stats.destinationLines);
  console.log("[M4.8b] lines positive qty:", draft.stats.linesWithPositiveQty);
  console.log("[M4.8b] unique SKUs:", draft.stats.uniqueSkus);
  console.log("[M4.8b] checksum:", draft.checksumSha256);
  console.log("[M4.8b] V-I1:", validation.vI1.pass ? "PASS" : "FAIL", validation.vI1);
  console.log("[M4.8b] V-I2:", validation.vI2.pass ? "PASS" : "FAIL");
  console.log("[M4.8b] report:", REPORT_PATH);

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
  if (validation.sourceSkuDuplicates.length) {
    risks.push(
      `${validation.sourceSkuDuplicates.length} SKU duplicados en STOCK MAESTRO (pre-unpivot)`
    );
  }
  if (!validation.vI1.pass) {
    risks.push("V-I1 FAIL — duplicados en grain destino o fuente");
  }
  if (!validation.vI2.pass) {
    risks.push("V-I2 FAIL — SKU/talle/owner inválidos");
  }
  if (draft.stats.sourceRowsEmptySku > 0) {
    risks.push(`${draft.stats.sourceRowsEmptySku} filas origen sin SKU`);
  }
  if (draft.stats.linesWithInvalidQty > 0) {
    risks.push(`${draft.stats.linesWithInvalidQty} celdas talle con cantidad no numérica`);
  }
  risks.push(
    "T0 propuesto es draft — declaración formal pendiente M4.8c; M4.5c no debe correr antes"
  );
  risks.push(
    "101 stock_movements piloto existentes — coordinar ventana T0 vs created_at al import real"
  );

  return risks;
}

main().catch((err) => {
  console.error("[M4.8b] fatal:", err);
  process.exit(1);
});
