/**
 * M4.8b.1 — Auditoría duplicados STOCK MAESTRO (read-only)
 */
import fs from "fs";
import path from "path";

import {
  auditStockMaestroDuplicates,
  topConflictiveDuplicates,
} from "../lib/erp/v2/audit-stock-maestro-duplicates";
import {
  auditStockMaestroHeaders,
  readStockMaestroFromSheets,
} from "../lib/erp/v2/read-stock-maestro";
import { unpivotStockMaestro } from "../lib/erp/v2/unpivot-stock-maestro";
import { validateSnapshotDraft } from "../lib/erp/v2/validate-inventory-snapshot-draft";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { loadEnvLocal } = require("./lib/l0-env.mjs");

const WIP = path.join(process.cwd(), "_wip");
const REPORT_PATH = path.join(WIP, "m4-inventory-snapshot-duplicates-audit.json");

loadEnvLocal();

async function main() {
  const generatedAt = new Date().toISOString();

  console.log("[M4.8b.1] read-only STOCK MAESTRO duplicates audit");

  const sheet = await readStockMaestroFromSheets();
  const headerAudit = auditStockMaestroHeaders(sheet.headers);
  const audit = auditStockMaestroDuplicates(sheet.sourceRows);

  const draft = unpivotStockMaestro(sheet.sourceRows, { includeZeroQty: true });
  const validation = validateSnapshotDraft(draft, sheet.sourceRows);

  const report = {
    generatedAt,
    milestone: "M4.8b.1",
    mode: "read-only-audit",
    writes: false,
    neon: false,
    sheetsModified: false,
    source: {
      sheetName: sheet.sheetName,
      fetchedAt: sheet.fetchedAt,
      headerAudit,
      sourceRowCount: sheet.sourceRows.length,
    },
    summary: audit.summary,
    validationSnapshot: {
      vI1Pass: validation.vI1.pass,
      vI2Pass: validation.vI2.pass,
      collisionKeyCount: audit.summary.collisionKeyCount,
      duplicateSkuCount: audit.summary.duplicateSkuCount,
      emptySkuRowCount: audit.summary.emptySkuRowCount,
    },
    top20ConflictiveDuplicates: topConflictiveDuplicates(audit, 20),
    duplicateSkus: audit.duplicateSkus,
    emptySkuRows: audit.emptySkuRows,
    recommendations: audit.recommendations,
  };

  if (!fs.existsSync(WIP)) fs.mkdirSync(WIP, { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

  console.log("[M4.8b.1] duplicate SKUs:", audit.summary.duplicateSkuCount);
  console.log("[M4.8b.1] collision keys:", audit.summary.collisionKeyCount);
  console.log("[M4.8b.1] empty SKU rows:", audit.summary.emptySkuRowCount);
  console.log(
    "[M4.8b.1] by classification:",
    JSON.stringify(audit.summary.byDuplicateClassification)
  );
  console.log(
    "[M4.8b.1] empty rows by classification:",
    JSON.stringify(audit.summary.byEmptyRowClassification)
  );
  console.log("[M4.8b.1] top conflictive:", report.top20ConflictiveDuplicates.map((d) => d.sku).join(", "));
  console.log("[M4.8b.1] report:", REPORT_PATH);
}

main().catch((err) => {
  console.error("[M4.8b.1] fatal:", err);
  process.exit(1);
});
