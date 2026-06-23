import type { SnapshotDraftLine } from "@/lib/erp/v2/unpivot-stock-maestro";
import { computeSnapshotDraftChecksum } from "@/lib/erp/v2/unpivot-stock-maestro";

export type TopQuantityAuditRow = {
  rank: number;
  sku: string;
  talle: string;
  owner: string;
  quantity: number;
  suspicious: boolean;
  suspiciousReasons: string[];
};

export type InventorySnapshotWriteValidation = {
  vI1: { id: "V-I1"; pass: boolean; duplicateCount: number };
  vI2: { id: "V-I2"; pass: boolean; invalidLineCount: number };
  vI3: {
    id: "V-I3";
    pass: boolean;
    snapshotLineCount: number;
    projectedLineCount: number;
    movementsAfterT0: number;
    quantityDelta: number;
  };
  vI4: {
    id: "V-I4";
    pass: boolean;
    persistedChecksum: string | null;
    recomputedChecksum: string;
  };
  allPass: boolean;
};

const SUSPICIOUS_QTY_THRESHOLDS = [3000, 5000, 10000];

function lineKey(sku: string, talle: string, owner: string): string {
  return `${sku}\0${talle}\0${owner}`;
}

export function auditTopQuantities(
  lines: Array<Pick<SnapshotDraftLine, "sku" | "talle" | "owner" | "quantity">>,
  limit = 100
): TopQuantityAuditRow[] {
  const sorted = [...lines].sort((a, b) => b.quantity - a.quantity).slice(0, limit);

  return sorted.map((line, index) => {
    const reasons: string[] = [];
    if (line.quantity >= 1000) reasons.push("qty_gte_1000");
    if (SUSPICIOUS_QTY_THRESHOLDS.includes(line.quantity)) {
      reasons.push(`qty_exact_${line.quantity}`);
    }
    if (line.quantity >= 5000) reasons.push("qty_gte_5000");

    return {
      rank: index + 1,
      sku: line.sku,
      talle: line.talle,
      owner: line.owner,
      quantity: line.quantity,
      suspicious: reasons.length > 0,
      suspiciousReasons: reasons,
    };
  });
}

export function validatePersistedSnapshotLines(
  lines: Array<{ sku: string; talle: string; owner: string; quantity: number }>
): { vI1Pass: boolean; vI2Pass: boolean; duplicateCount: number; invalidLineCount: number } {
  const keyCounts = new Map<string, number>();
  let invalidLineCount = 0;

  for (const line of lines) {
    const key = lineKey(line.sku, line.talle, line.owner);
    keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);

    if (!line.sku?.trim()) invalidLineCount += 1;
    if (!line.talle?.trim()) invalidLineCount += 1;
    if (!["8Q", "SCNL"].includes(line.owner)) invalidLineCount += 1;
  }

  const duplicateCount = [...keyCounts.values()].filter((c) => c > 1).length;

  return {
    vI1Pass: duplicateCount === 0,
    vI2Pass: invalidLineCount === 0,
    duplicateCount,
    invalidLineCount,
  };
}

export function validateSnapshotProjectionAtT0(opts: {
  snapshotLines: Array<{ sku: string; talle: string; owner: string; quantity: number }>;
  movementsAfterT0: Array<{
    sku: string;
    talle: string | null;
    owner: string | null;
    quantity: number;
    direction: string;
    movementType: string;
    createdAt: Date;
  }>;
}): { pass: boolean; projectedLineCount: number; quantityDelta: number } {
  const projected = new Map<string, number>();

  for (const line of opts.snapshotLines) {
    projected.set(lineKey(line.sku, line.talle, line.owner), line.quantity);
  }

  for (const move of opts.movementsAfterT0) {
    const talle = move.talle ?? "";
    const owner = move.owner ?? "8Q";
    const key = lineKey(move.sku, talle, owner);
    const current = projected.get(key) ?? 0;

    if (move.direction === "in") {
      projected.set(key, current + move.quantity);
    } else if (move.direction === "out") {
      projected.set(key, current - move.quantity);
    } else if (move.movementType === "manual_adjustment") {
      projected.set(key, current + move.quantity);
    }
  }

  let quantityDelta = 0;
  for (const line of opts.snapshotLines) {
    const key = lineKey(line.sku, line.talle, line.owner);
    const projectedQty = projected.get(key) ?? 0;
    quantityDelta += Math.abs(projectedQty - line.quantity);
  }

  const pass = opts.movementsAfterT0.length === 0 && quantityDelta === 0;

  return {
    pass,
    projectedLineCount: projected.size,
    quantityDelta,
  };
}

export function validatePersistedChecksum(opts: {
  persistedChecksum: string | null;
  lines: Array<{ sku: string; talle: string; owner: string; quantity: number }>;
}): { pass: boolean; recomputedChecksum: string } {
  const recomputedChecksum = computeSnapshotDraftChecksum(
    opts.lines.map((l) => ({
      sku: l.sku,
      talle: l.talle,
      owner: l.owner as "8Q" | "SCNL",
      quantity: l.quantity,
      sourceRowIndex: 0,
      sourceSku: l.sku,
      articulo: "",
      normalization: "embedded_talle" as const,
    }))
  );

  return {
    pass: opts.persistedChecksum === recomputedChecksum,
    recomputedChecksum,
  };
}

export function buildWriteValidationReport(opts: {
  lines: Array<{ sku: string; talle: string; owner: string; quantity: number }>;
  persistedChecksum: string | null;
  movementsAfterT0Count: number;
  movementsAfterT0: Parameters<typeof validateSnapshotProjectionAtT0>[0]["movementsAfterT0"];
}): InventorySnapshotWriteValidation {
  const lineValidation = validatePersistedSnapshotLines(opts.lines);
  const vI3Result = validateSnapshotProjectionAtT0({
    snapshotLines: opts.lines,
    movementsAfterT0: opts.movementsAfterT0,
  });
  const vI4Result = validatePersistedChecksum({
    persistedChecksum: opts.persistedChecksum,
    lines: opts.lines,
  });

  const vI1 = {
    id: "V-I1" as const,
    pass: lineValidation.vI1Pass,
    duplicateCount: lineValidation.duplicateCount,
  };
  const vI2 = {
    id: "V-I2" as const,
    pass: lineValidation.vI2Pass,
    invalidLineCount: lineValidation.invalidLineCount,
  };
  const vI3 = {
    id: "V-I3" as const,
    pass: vI3Result.pass,
    snapshotLineCount: opts.lines.length,
    projectedLineCount: vI3Result.projectedLineCount,
    movementsAfterT0: opts.movementsAfterT0Count,
    quantityDelta: vI3Result.quantityDelta,
  };
  const vI4 = {
    id: "V-I4" as const,
    pass: vI4Result.pass,
    persistedChecksum: opts.persistedChecksum,
    recomputedChecksum: vI4Result.recomputedChecksum,
  };

  return {
    vI1,
    vI2,
    vI3,
    vI4,
    allPass: vI1.pass && vI2.pass && vI3.pass && vI4.pass,
  };
}

export function snapshotRunNotesT0(opts: {
  snapshotDateIso: string;
  checksum: string;
  rowCount: number;
}): string {
  return [
    "ERP V2 inventory point zero (T0) — declared via M4.8c",
    `T0=${opts.snapshotDateIso}`,
    `checksum=${opts.checksum}`,
    `row_count=${opts.rowCount}`,
    "source=stock_maestro_bootstrap",
    "projection= snapshot_T0 + stock_movements_post_T0",
  ].join("\n");
}
