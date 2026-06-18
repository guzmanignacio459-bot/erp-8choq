import { createHash } from "crypto";

import { inferSnapshotOwner } from "@/lib/erp/v2/infer-snapshot-owner";
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
  articulo: string;
};

export type UnpivotStockMaestroOpts = {
  includeZeroQty?: boolean;
  proposedSnapshotDate?: string;
  label?: string;
};

export type SnapshotDraft = {
  proposedSnapshotDate: string;
  label: string;
  source: "stock_maestro_bootstrap";
  lines: SnapshotDraftLine[];
  checksumSha256: string;
  stats: {
    sourceRows: number;
    sourceRowsWithSku: number;
    sourceRowsEmptySku: number;
    destinationLines: number;
    linesWithPositiveQty: number;
    linesWithZeroQty: number;
    linesWithInvalidQty: number;
    uniqueSkus: number;
    totalQuantity: number;
  };
};

function isInvalidQty(n: number): boolean {
  return Number.isNaN(n) || !Number.isFinite(n);
}

export function unpivotStockMaestroRow(
  row: StockMaestroRow,
  opts?: { includeZeroQty?: boolean }
): SnapshotDraftLine[] {
  const includeZeroQty = opts?.includeZeroQty ?? true;
  const owner = inferSnapshotOwner(row.sku);
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
      articulo: row.articulo,
    });
  }

  return lines;
}

export function unpivotStockMaestro(
  sourceRows: StockMaestroRow[],
  opts?: UnpivotStockMaestroOpts
): SnapshotDraft {
  const includeZeroQty = opts?.includeZeroQty ?? true;
  const proposedSnapshotDate = opts?.proposedSnapshotDate ?? new Date().toISOString();
  const label = opts?.label ?? `bootstrap-draft-${proposedSnapshotDate.slice(0, 10)}`;

  const lines: SnapshotDraftLine[] = [];
  let linesWithInvalidQty = 0;

  for (const row of sourceRows) {
    for (const talle of STOCK_MAESTRO_SIZE_COLUMNS) {
      const qty = row.sizes[talle];
      if (isInvalidQty(qty)) {
        linesWithInvalidQty += 1;
        continue;
      }
      if (!includeZeroQty && qty === 0) continue;
      if (!row.sku) continue;

      lines.push({
        sku: row.sku,
        talle,
        owner: inferSnapshotOwner(row.sku),
        quantity: qty,
        sourceRowIndex: row.rowIndex,
        articulo: row.articulo,
      });
    }
  }

  const checksumSha256 = computeSnapshotDraftChecksum(lines);
  const sourceRowsWithSku = sourceRows.filter((r) => r.sku).length;

  return {
    proposedSnapshotDate,
    label,
    source: "stock_maestro_bootstrap",
    lines,
    checksumSha256,
    stats: {
      sourceRows: sourceRows.length,
      sourceRowsWithSku,
      sourceRowsEmptySku: sourceRows.length - sourceRowsWithSku,
      destinationLines: lines.length,
      linesWithPositiveQty: lines.filter((l) => l.quantity > 0).length,
      linesWithZeroQty: lines.filter((l) => l.quantity === 0).length,
      linesWithInvalidQty,
      uniqueSkus: new Set(lines.map((l) => l.sku)).size,
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
