import { createHash } from "crypto";

import { deriveSnapshotBaseSku, normalizeEmbeddedSku } from "@/lib/erp/v2/derive-snapshot-base-sku";
import { inferSnapshotOwner } from "@/lib/erp/v2/infer-snapshot-owner";
import {
  filterBootstrapSourceRows,
  type BootstrapRowExclusion,
} from "@/lib/erp/v2/filter-stock-maestro-bootstrap";
import type { StockMaestroRow } from "@/lib/erp/v2/read-stock-maestro";
import {
  STOCK_MAESTRO_SIZE_COLUMNS,
  VALID_STOCK_SIZE_SET,
} from "@/lib/erp/v2/stock-maestro-constants";

export type SnapshotDraftLine = {
  sku: string;
  talle: string;
  owner: "8Q" | "SCNL";
  quantity: number;
  sourceRowIndex: number;
  sourceSku: string;
  articulo: string;
  normalization: "grid_unpivot" | "embedded_talle";
};

export type UnpivotStockMaestroOpts = {
  includeZeroQty?: boolean;
  proposedSnapshotDate?: string;
  label?: string;
  normalizeEmbeddedTalle?: boolean;
  dedupeKeys?: boolean;
};

export type SnapshotDraft = {
  proposedSnapshotDate: string;
  label: string;
  source: "stock_maestro_bootstrap";
  lines: SnapshotDraftLine[];
  checksumSha256: string;
  exclusions: BootstrapRowExclusion[];
  warnings: BootstrapRowExclusion[];
  stats: {
    sourceRows: number;
    eligibleSourceRows: number;
    excludedRows: number;
    excludedSyncArtifactRows: number;
    manualReviewRequiredRows: number;
    sourceRowsWithSku: number;
    sourceRowsEmptySku: number;
    embeddedTalleRows: number;
    gridUnpivotRows: number;
    rawLinesBeforeDedupe: number;
    dedupedLinesMerged: number;
    destinationLines: number;
    linesWithPositiveQty: number;
    linesWithZeroQty: number;
    linesWithInvalidQty: number;
    uniqueSnapshotKeys: number;
    totalQuantity: number;
  };
};

function isInvalidQty(n: number): boolean {
  return Number.isNaN(n) || !Number.isFinite(n);
}

function lineKey(line: Pick<SnapshotDraftLine, "sku" | "talle" | "owner">): string {
  return `${line.sku}\0${line.talle}\0${line.owner}`;
}

function emitGridUnpivotLines(
  row: StockMaestroRow,
  includeZeroQty: boolean
): SnapshotDraftLine[] {
  const owner = inferSnapshotOwner(row.sku) as "8Q" | "SCNL";
  const lines: SnapshotDraftLine[] = [];

  for (const talle of STOCK_MAESTRO_SIZE_COLUMNS) {
    const qty = row.sizes[talle];
    if (isInvalidQty(qty)) continue;
    if (!includeZeroQty && qty === 0) continue;

    lines.push({
      sku: row.sku,
      talle,
      owner,
      quantity: qty,
      sourceRowIndex: row.rowIndex,
      sourceSku: row.sku,
      articulo: row.articulo,
      normalization: "grid_unpivot",
    });
  }

  return lines;
}

function emitEmbeddedTalleLine(
  row: StockMaestroRow,
  includeZeroQty: boolean
): SnapshotDraftLine[] {
  const normalized = normalizeEmbeddedSku(row.sku);
  if (!normalized) return emitGridUnpivotLines(row, includeZeroQty);

  const qty = row.sizes[normalized.talle];
  if (isInvalidQty(qty)) return [];
  if (!includeZeroQty && qty === 0) return [];

  return [
    {
      sku: normalized.baseSku,
      talle: normalized.talle,
      owner: normalized.owner,
      quantity: qty,
      sourceRowIndex: row.rowIndex,
      sourceSku: row.sku,
      articulo: row.articulo,
      normalization: "embedded_talle",
    },
  ];
}

export function unpivotStockMaestroRow(
  row: StockMaestroRow,
  opts?: { includeZeroQty?: boolean; normalizeEmbeddedTalle?: boolean }
): SnapshotDraftLine[] {
  const includeZeroQty = opts?.includeZeroQty ?? true;
  const normalizeEmbeddedTalle = opts?.normalizeEmbeddedTalle ?? true;

  if (normalizeEmbeddedTalle && normalizeEmbeddedSku(row.sku)) {
    return emitEmbeddedTalleLine(row, includeZeroQty);
  }

  return emitGridUnpivotLines(row, includeZeroQty);
}

function dedupeSnapshotLines(lines: SnapshotDraftLine[]): {
  lines: SnapshotDraftLine[];
  mergedCount: number;
} {
  const map = new Map<string, SnapshotDraftLine>();

  for (const line of lines) {
    const key = lineKey(line);
    const existing = map.get(key);
    if (!existing || line.sourceRowIndex > existing.sourceRowIndex) {
      map.set(key, line);
    }
  }

  const deduped = [...map.values()];
  return {
    lines: deduped,
    mergedCount: lines.length - deduped.length,
  };
}

export function unpivotStockMaestro(
  sourceRows: StockMaestroRow[],
  opts?: UnpivotStockMaestroOpts
): SnapshotDraft {
  const includeZeroQty = opts?.includeZeroQty ?? true;
  const normalizeEmbeddedTalle = opts?.normalizeEmbeddedTalle ?? true;
  const dedupeKeys = opts?.dedupeKeys ?? true;
  const proposedSnapshotDate = opts?.proposedSnapshotDate ?? new Date().toISOString();
  const label = opts?.label ?? `bootstrap-draft-${proposedSnapshotDate.slice(0, 10)}`;

  const { eligibleRows, exclusions, warnings } = filterBootstrapSourceRows(sourceRows);

  const rawLines: SnapshotDraftLine[] = [];
  let linesWithInvalidQty = 0;
  let embeddedTalleRows = 0;
  let gridUnpivotRows = 0;

  for (const row of eligibleRows) {
    const isEmbedded = normalizeEmbeddedTalle && Boolean(normalizeEmbeddedSku(row.sku));

    if (isEmbedded) {
      embeddedTalleRows += 1;
      const lines = emitEmbeddedTalleLine(row, includeZeroQty);
      if (!lines.length) {
        const normalized = normalizeEmbeddedSku(row.sku);
        if (normalized && isInvalidQty(row.sizes[normalized.talle])) {
          linesWithInvalidQty += 1;
        }
      }
      rawLines.push(...lines);
      continue;
    }

    gridUnpivotRows += 1;
    for (const talle of STOCK_MAESTRO_SIZE_COLUMNS) {
      const qty = row.sizes[talle];
      if (isInvalidQty(qty)) {
        linesWithInvalidQty += 1;
        continue;
      }
      if (!includeZeroQty && qty === 0) continue;

      rawLines.push({
        sku: row.sku,
        talle,
        owner: inferSnapshotOwner(row.sku) as "8Q" | "SCNL",
        quantity: qty,
        sourceRowIndex: row.rowIndex,
        sourceSku: row.sku,
        articulo: row.articulo,
        normalization: "grid_unpivot",
      });
    }
  }

  const { lines, mergedCount } = dedupeKeys
    ? dedupeSnapshotLines(rawLines)
    : { lines: rawLines, mergedCount: 0 };

  const checksumSha256 = computeSnapshotDraftChecksum(lines);
  const sourceRowsWithSku = sourceRows.filter((r) => r.sku).length;
  const excludedSyncArtifactRows = exclusions.filter(
    (e) => e.reason === "sync_artifact_empty_sku"
  ).length;
  const manualReviewRequiredRows = warnings.filter(
    (e) => e.reason === "manual_review_required"
  ).length;

  return {
    proposedSnapshotDate,
    label,
    source: "stock_maestro_bootstrap",
    lines,
    checksumSha256,
    exclusions,
    warnings,
    stats: {
      sourceRows: sourceRows.length,
      eligibleSourceRows: eligibleRows.length,
      excludedRows: exclusions.length,
      excludedSyncArtifactRows,
      manualReviewRequiredRows,
      sourceRowsWithSku,
      sourceRowsEmptySku: sourceRows.length - sourceRowsWithSku,
      embeddedTalleRows,
      gridUnpivotRows,
      rawLinesBeforeDedupe: rawLines.length,
      dedupedLinesMerged: mergedCount,
      destinationLines: lines.length,
      linesWithPositiveQty: lines.filter((l) => l.quantity > 0).length,
      linesWithZeroQty: lines.filter((l) => l.quantity === 0).length,
      linesWithInvalidQty,
      uniqueSnapshotKeys: new Set(lines.map(lineKey)).size,
      totalQuantity: lines.reduce((a, l) => a + l.quantity, 0),
    },
  };
}

export function computeSnapshotDraftChecksum(lines: SnapshotDraftLine[]): string {
  const canonical = [...lines]
    .sort((a, b) => {
      const sku = a.sku.localeCompare(b.sku);
      if (sku !== 0) return sku;
      const talle = a.talle.localeCompare(b.talle);
      if (talle !== 0) return talle;
      return a.owner.localeCompare(b.owner);
    })
    .map((l) => ({
      sku: l.sku,
      talle: l.talle,
      owner: l.owner,
      quantity: l.quantity,
    }));

  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export function findUnknownSizeColumns(headers: string[]): string[] {
  const known = new Set<string>(["SKU", "ARTICULO", "Stock Total", ...STOCK_MAESTRO_SIZE_COLUMNS]);
  return headers.filter((h) => h && !known.has(h) && !VALID_STOCK_SIZE_SET.has(h));
}

export { deriveSnapshotBaseSku, normalizeEmbeddedSku };
