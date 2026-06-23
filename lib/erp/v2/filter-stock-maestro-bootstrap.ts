import type { StockMaestroRow } from "@/lib/erp/v2/read-stock-maestro";
import { STOCK_MAESTRO_SIZE_COLUMNS } from "@/lib/erp/v2/stock-maestro-constants";

export type BootstrapExclusionReason =
  | "sync_artifact_empty_sku"
  | "manual_review_required";

export type BootstrapRowExclusion = {
  rowIndex: number;
  articulo: string;
  reason: BootstrapExclusionReason;
  warningOnly: boolean;
  classificationReason: string;
};

export type BootstrapFilterResult = {
  eligibleRows: StockMaestroRow[];
  exclusions: BootstrapRowExclusion[];
  warnings: BootstrapRowExclusion[];
};

const MANUAL_REVIEW_ARTICULOS = new Set(["REMERA RUN AWAY"]);

function isUniformSyncPlaceholder(row: StockMaestroRow): boolean {
  if (row.sku) return false;
  return STOCK_MAESTRO_SIZE_COLUMNS.every((t) => row.sizes[t] === 3000);
}

function isManualReviewRow(row: StockMaestroRow): boolean {
  if (row.sku) return false;
  const articulo = row.articulo.trim().toUpperCase();
  return MANUAL_REVIEW_ARTICULOS.has(articulo) || row.rowIndex === 2214;
}

export function filterBootstrapSourceRows(
  sourceRows: StockMaestroRow[]
): BootstrapFilterResult {
  const eligibleRows: StockMaestroRow[] = [];
  const exclusions: BootstrapRowExclusion[] = [];
  const warnings: BootstrapRowExclusion[] = [];

  for (const row of sourceRows) {
    if (row.sku) {
      eligibleRows.push(row);
      continue;
    }

    if (isManualReviewRow(row)) {
      const entry: BootstrapRowExclusion = {
        rowIndex: row.rowIndex,
        articulo: row.articulo,
        reason: "manual_review_required",
        warningOnly: true,
        classificationReason:
          "Fila sin SKU con artículo identificado — audit-only, no bloquea bootstrap",
      };
      exclusions.push(entry);
      warnings.push(entry);
      continue;
    }

    if (isUniformSyncPlaceholder(row)) {
      exclusions.push({
        rowIndex: row.rowIndex,
        articulo: row.articulo,
        reason: "sync_artifact_empty_sku",
        warningOnly: false,
        classificationReason:
          "Grilla uniforme 3000 sin SKU — artefacto sync TN excluido del bootstrap",
      });
      continue;
    }

    exclusions.push({
      rowIndex: row.rowIndex,
      articulo: row.articulo,
      reason: "sync_artifact_empty_sku",
      warningOnly: false,
      classificationReason: "Fila sin SKU excluida del bootstrap",
    });
  }

  return { eligibleRows, exclusions, warnings };
}
