import type { SnapshotDraft, SnapshotDraftLine } from "@/lib/erp/v2/unpivot-stock-maestro";
import {
  VALID_SNAPSHOT_OWNERS,
  VALID_STOCK_SIZE_SET,
} from "@/lib/erp/v2/stock-maestro-constants";
import type { StockMaestroRow } from "@/lib/erp/v2/read-stock-maestro";

export type SnapshotDuplicateKey = {
  sku: string;
  talle: string;
  owner: string;
  count: number;
  sourceRowIndexes: number[];
};

export type InvalidSkuIssue = {
  sku: string;
  reason: string;
  sourceRowIndex: number;
  articulo?: string;
};

export type InvalidTalleIssue = {
  sku: string;
  talle: string;
  reason: string;
  sourceRowIndex: number;
};

export type SourceSkuDuplicate = {
  sku: string;
  count: number;
  sourceRowIndexes: number[];
};

export type SnapshotDraftValidation = {
  vI1: {
    id: "V-I1";
    pass: boolean;
    duplicateCount: number;
    duplicates: SnapshotDuplicateKey[];
  };
  vI2: {
    id: "V-I2";
    pass: boolean;
    invalidSkuCount: number;
    invalidTalleCount: number;
    invalidOwnerCount: number;
    invalidSkus: InvalidSkuIssue[];
    invalidTalles: InvalidTalleIssue[];
    invalidOwners: Array<{ sku: string; owner: string; talle: string }>;
  };
  sourceSkuDuplicates: SourceSkuDuplicate[];
  allPass: boolean;
};

const VALID_OWNER_SET = new Set<string>(VALID_SNAPSHOT_OWNERS);

function lineKey(line: Pick<SnapshotDraftLine, "sku" | "talle" | "owner">): string {
  return `${line.sku}\0${line.talle}\0${line.owner}`;
}

export function validateSnapshotDraft(
  draft: SnapshotDraft,
  sourceRows?: StockMaestroRow[]
): SnapshotDraftValidation {
  const dupMap = new Map<string, SnapshotDuplicateKey>();

  for (const line of draft.lines) {
    const key = lineKey(line);
    const existing = dupMap.get(key);
    if (!existing) {
      dupMap.set(key, {
        sku: line.sku,
        talle: line.talle,
        owner: line.owner,
        count: 1,
        sourceRowIndexes: [line.sourceRowIndex],
      });
    } else {
      existing.count += 1;
      if (!existing.sourceRowIndexes.includes(line.sourceRowIndex)) {
        existing.sourceRowIndexes.push(line.sourceRowIndex);
      }
    }
  }

  const duplicates = [...dupMap.values()].filter((d) => d.count > 1);

  const invalidSkus: InvalidSkuIssue[] = [];
  const invalidTalles: InvalidTalleIssue[] = [];
  const invalidOwners: Array<{ sku: string; owner: string; talle: string }> = [];

  const seenSkuIssues = new Set<string>();

  for (const line of draft.lines) {
    if (!line.sku || !line.sku.trim()) {
      const issueKey = `empty:${line.sourceRowIndex}`;
      if (!seenSkuIssues.has(issueKey)) {
        invalidSkus.push({
          sku: line.sku,
          reason: "empty_sku",
          sourceRowIndex: line.sourceRowIndex,
          articulo: line.articulo,
        });
        seenSkuIssues.add(issueKey);
      }
    }

    if (!VALID_STOCK_SIZE_SET.has(line.talle)) {
      invalidTalles.push({
        sku: line.sku,
        talle: line.talle,
        reason: "invalid_talle",
        sourceRowIndex: line.sourceRowIndex,
      });
    }

    if (!VALID_OWNER_SET.has(line.owner)) {
      invalidOwners.push({
        sku: line.sku,
        owner: line.owner,
        talle: line.talle,
      });
    }
  }

  if (sourceRows) {
    for (const row of sourceRows) {
      if (!row.sku) {
        invalidSkus.push({
          sku: "",
          reason: "empty_sku_source_row",
          sourceRowIndex: row.rowIndex,
          articulo: row.articulo,
        });
      }
    }
  }

  const sourceSkuDupMap = new Map<string, SourceSkuDuplicate>();
  if (sourceRows) {
    for (const row of sourceRows) {
      if (!row.sku) continue;
      const existing = sourceSkuDupMap.get(row.sku);
      if (!existing) {
        sourceSkuDupMap.set(row.sku, {
          sku: row.sku,
          count: 1,
          sourceRowIndexes: [row.rowIndex],
        });
      } else {
        existing.count += 1;
        existing.sourceRowIndexes.push(row.rowIndex);
      }
    }
  }

  const sourceSkuDuplicates = [...sourceSkuDupMap.values()].filter((d) => d.count > 1);

  const vI1 = {
    id: "V-I1" as const,
    pass: duplicates.length === 0 && sourceSkuDuplicates.length === 0,
    duplicateCount: duplicates.length + sourceSkuDuplicates.length,
    duplicates,
  };

  const vI2 = {
    id: "V-I2" as const,
    pass:
      invalidSkus.length === 0 &&
      invalidTalles.length === 0 &&
      invalidOwners.length === 0,
    invalidSkuCount: invalidSkus.length,
    invalidTalleCount: invalidTalles.length,
    invalidOwnerCount: invalidOwners.length,
    invalidSkus: invalidSkus.slice(0, 50),
    invalidTalles: invalidTalles.slice(0, 50),
    invalidOwners: invalidOwners.slice(0, 50),
  };

  return {
    vI1,
    vI2,
    sourceSkuDuplicates: sourceSkuDuplicates.slice(0, 50),
    allPass: vI1.pass && vI2.pass,
  };
}
