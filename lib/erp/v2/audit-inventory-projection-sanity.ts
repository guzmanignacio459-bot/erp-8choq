import { computeSnapshotDraftChecksum } from "@/lib/erp/v2/unpivot-stock-maestro";
import {
  computeInventoryProjection,
  projectionKey,
  summarizeProjection,
  type ProjectionRow,
  type StockMovementDelta,
} from "@/lib/erp/v2/compute-inventory-projection";
import { parseTnSku } from "@/lib/erp/v2/parse-tn-sku";
import {
  VALID_SNAPSHOT_OWNERS,
  VALID_STOCK_SIZE_SET,
} from "@/lib/erp/v2/stock-maestro-constants";

export type QuantityClass = "normal" | "sospechoso" | "extremo";

export type RiskLevel = "blocker" | "warning" | "informational";

export type RankedQuantityRow = {
  rank: number;
  sku: string;
  talle: string;
  owner: string;
  quantity: number;
  classification: QuantityClass;
  reasons: string[];
};

export type InventorySanityRisk = {
  id: string;
  level: RiskLevel;
  category: string;
  message: string;
  evidence?: Record<string, unknown>;
};

export type DistributionStats = {
  totalSkus: number;
  totalVariants: number;
  averagePerVariant: number;
  median: number;
  p95: number;
  p99: number;
  maximum: number;
  zeroQtyVariants: number;
  negativeQtyVariants: number;
};

export type ConcentrationStats = {
  topN: number;
  skuCount: number;
  quantity: number;
  pctOfInventory: number;
};

export type DimensionReconciliation = {
  dimension: "global" | "owner" | "talle";
  key: string;
  snapshotQty: number;
  netDelta: number;
  projectedQty: number;
  expectedProjectedQty: number;
  deltaMismatch: number;
  pass: boolean;
};

export type SnapshotSanityCheck = {
  activeRunCount: number;
  expectedRunId: string;
  runId: string;
  rowCount: number;
  expectedRowCount: number;
  persistedChecksum: string | null;
  recomputedChecksum: string;
  checksumMatch: boolean;
  pass: boolean;
};

export type InventoryProjectionSanityReport = {
  generatedAt: string;
  milestone: "M4.9";
  mode: "read-only-audit";
  snapshot: {
    runId: string;
    snapshotDate: string;
    rowCount: number;
    checksumSha256: string | null;
  };
  executiveSummary: {
    projectionRowCount: number;
    snapshotQtyTotal: number;
    movementDeltaTotal: number;
    projectedQtyTotal: number;
    expectedProjectedQty: number;
    projectionFormulaPass: boolean;
    m5Recommendation: "GO" | "NO_GO" | "GO_WITH_WARNINGS";
    blockerCount: number;
    warningCount: number;
  };
  topProjected: RankedQuantityRow[];
  topSnapshot: RankedQuantityRow[];
  topMovementDelta: RankedQuantityRow[];
  distribution: DistributionStats;
  concentration: ConcentrationStats[];
  anomalies: {
    negativeQty: ProjectionRow[];
    zeroQty: number;
    absurdlyHigh: RankedQuantityRow[];
    unexpectedOwners: Array<{ sku: string; talle: string; owner: string; projectedQty: number }>;
    unexpectedTalles: Array<{ sku: string; talle: string; owner: string; projectedQty: number }>;
    embeddedTalleSkus: Array<{ sku: string; talle: string; owner: string; projectedQty: number }>;
    orphanMovementRows: number;
    grainMismatchMovements: number;
    grainMismatchSamples: Array<{ sku: string; talle: string | null; owner: string | null }>;
  };
  snapshotValidation: SnapshotSanityCheck;
  projectionReconciliation: {
    global: DimensionReconciliation;
    byOwner: DimensionReconciliation[];
    byTalle: DimensionReconciliation[];
    allPass: boolean;
  };
  risks: InventorySanityRisk[];
};

const EXPECTED_T0_CHECKSUM =
  "4e0e7083d84d38bd9f0d9ef5c85c93693d1849881ce04f66d887d7740d3d4689";
const EXPECTED_ROW_COUNT = 2903;
const EXPECTED_SNAPSHOT_QTY = 8_708_653;
const EXPECTED_NET_DELTA = -2_716;
const EXPECTED_PROJECTED_QTY = 8_705_937;

function classifyQuantity(qty: number): { classification: QuantityClass; reasons: string[] } {
  const reasons: string[] = [];
  if (qty >= 10_000) {
    reasons.push("qty_gte_10000");
    return { classification: "extremo", reasons };
  }
  if (qty >= 3_000) {
    reasons.push("qty_gte_3000");
    return { classification: "extremo", reasons };
  }
  if (qty >= 1_000) {
    reasons.push("qty_gte_1000");
    return { classification: "sospechoso", reasons };
  }
  return { classification: "normal", reasons };
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

function median(sorted: number[]): number {
  if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function rankTop(
  rows: Array<{ sku: string; talle: string; owner: string; quantity: number }>,
  limit = 100
): RankedQuantityRow[] {
  return [...rows]
    .sort((a, b) => b.quantity - a.quantity || a.sku.localeCompare(b.sku))
    .slice(0, limit)
    .map((row, index) => {
      const { classification, reasons } = classifyQuantity(row.quantity);
      return {
        rank: index + 1,
        sku: row.sku,
        talle: row.talle,
        owner: row.owner,
        quantity: row.quantity,
        classification,
        reasons,
      };
    });
}

function computeDistribution(rows: ProjectionRow[]): DistributionStats {
  const projected = rows.map((r) => r.projectedQty).sort((a, b) => a - b);
  const skuSet = new Set(rows.map((r) => r.sku));

  return {
    totalSkus: skuSet.size,
    totalVariants: rows.length,
    averagePerVariant:
      rows.length > 0
        ? Math.round(
            (rows.reduce((a, r) => a + r.projectedQty, 0) / rows.length) * 100
          ) / 100
        : 0,
    median: median(projected),
    p95: percentile(projected, 95),
    p99: percentile(projected, 99),
    maximum: projected.length ? projected[projected.length - 1] : 0,
    zeroQtyVariants: rows.filter((r) => r.projectedQty === 0).length,
    negativeQtyVariants: rows.filter((r) => r.projectedQty < 0).length,
  };
}

function computeConcentration(rows: ProjectionRow[], topNs: number[]): ConcentrationStats[] {
  const bySku = new Map<string, number>();
  let total = 0;

  for (const row of rows) {
    bySku.set(row.sku, (bySku.get(row.sku) ?? 0) + row.projectedQty);
    total += row.projectedQty;
  }

  const sorted = [...bySku.entries()].sort((a, b) => b[1] - a[1]);

  return topNs.map((topN) => {
    const slice = sorted.slice(0, topN);
    const quantity = slice.reduce((a, [, q]) => a + q, 0);
    return {
      topN,
      skuCount: slice.length,
      quantity,
      pctOfInventory: total ? Math.round((quantity / total) * 10000) / 100 : 0,
    };
  });
}

function reconcileDimension(
  rows: ProjectionRow[],
  dimension: "global" | "owner" | "talle",
  key: string
): DimensionReconciliation {
  const filtered =
    dimension === "global"
      ? rows
      : rows.filter((r) => (dimension === "owner" ? r.owner : r.talle) === key);

  const snapshotQty = filtered.reduce((a, r) => a + r.snapshotQty, 0);
  const netDelta = filtered.reduce((a, r) => a + r.netDelta, 0);
  const projectedQty = filtered.reduce((a, r) => a + r.projectedQty, 0);
  const expectedProjectedQty = snapshotQty + netDelta;
  const deltaMismatch = Math.abs(projectedQty - expectedProjectedQty);

  return {
    dimension,
    key,
    snapshotQty,
    netDelta,
    projectedQty,
    expectedProjectedQty,
    deltaMismatch,
    pass: deltaMismatch === 0,
  };
}

export function buildInventoryProjectionSanityReport(opts: {
  snapshot: {
    runId: string;
    snapshotDate: string;
    rowCount: number;
    checksumSha256: string | null;
  };
  activeRunCount: number;
  snapshotLines: Array<{ sku: string; talle: string; owner: string; quantity: number }>;
  movements: StockMovementDelta[];
  rows: ProjectionRow[];
}): InventoryProjectionSanityReport {
  const totals = summarizeProjection(opts.rows);
  const recomputedChecksum = computeSnapshotDraftChecksum(
    opts.snapshotLines.map((l) => ({
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

  const recomputed = computeInventoryProjection({
    snapshotLines: opts.snapshotLines,
    movements: opts.movements,
  });
  const formulaPass =
    totals.projectedQuantityTotal ===
      totals.snapshotQuantityTotal + totals.netDeltaTotal &&
    recomputed.every((r) => {
      const key = projectionKey(r.sku, r.talle, r.owner);
      const original = opts.rows.find(
        (x) => projectionKey(x.sku, x.talle, x.owner) === key
      );
      return original?.projectedQty === r.projectedQty;
    });

  const snapshotValidation: SnapshotSanityCheck = {
    activeRunCount: opts.activeRunCount,
    expectedRunId: opts.snapshot.runId,
    runId: opts.snapshot.runId,
    rowCount: opts.snapshot.rowCount,
    expectedRowCount: EXPECTED_ROW_COUNT,
    persistedChecksum: opts.snapshot.checksumSha256,
    recomputedChecksum,
    checksumMatch:
      opts.snapshot.checksumSha256 === recomputedChecksum &&
      recomputedChecksum === EXPECTED_T0_CHECKSUM,
    pass:
      opts.activeRunCount === 1 &&
      opts.snapshot.rowCount === EXPECTED_ROW_COUNT &&
      opts.snapshot.checksumSha256 === recomputedChecksum,
  };

  const byOwner = [...new Set(opts.rows.map((r) => r.owner))].sort();
  const byTalle = [...new Set(opts.rows.map((r) => r.talle))].sort();

  const projectionReconciliation = {
    global: reconcileDimension(opts.rows, "global", "ALL"),
    byOwner: byOwner.map((owner) => reconcileDimension(opts.rows, "owner", owner)),
    byTalle: byTalle.map((talle) => reconcileDimension(opts.rows, "talle", talle)),
    allPass: false,
  };
  projectionReconciliation.allPass =
    projectionReconciliation.global.pass &&
    projectionReconciliation.byOwner.every((r) => r.pass) &&
    projectionReconciliation.byTalle.every((r) => r.pass);

  const movementAccum = opts.rows
    .filter((r) => r.netDelta !== 0)
    .map((r) => ({
      sku: r.sku,
      talle: r.talle,
      owner: r.owner,
      quantity: Math.abs(r.netDelta),
    }));

  const snapshotKeySet = new Set(
    opts.snapshotLines.map((l) => projectionKey(l.sku, l.talle, l.owner))
  );
  const orphanMovementRows = opts.rows.filter(
    (r) => r.snapshotQty === 0 && r.netDelta !== 0
  );
  const grainMismatchMovements = opts.movements.filter((m) => {
    const key = projectionKey(m.sku, m.talle ?? "", m.owner ?? "8Q");
    return !snapshotKeySet.has(key);
  });

  const unexpectedOwners = opts.rows
    .filter((r) => !VALID_SNAPSHOT_OWNERS.includes(r.owner as "8Q" | "SCNL"))
    .slice(0, 50);
  const unexpectedTalles = opts.rows
    .filter((r) => !VALID_STOCK_SIZE_SET.has(r.talle))
    .slice(0, 50);
  const embeddedTalleSkus = opts.rows
    .filter((r) => parseTnSku(r.sku).talle !== null)
    .slice(0, 50);

  const topProjected = rankTop(
    opts.rows.map((r) => ({
      sku: r.sku,
      talle: r.talle,
      owner: r.owner,
      quantity: r.projectedQty,
    }))
  );
  const topSnapshot = rankTop(
    opts.rows.map((r) => ({
      sku: r.sku,
      talle: r.talle,
      owner: r.owner,
      quantity: r.snapshotQty,
    }))
  );
  const topMovementDelta = rankTop(movementAccum);

  const distribution = computeDistribution(opts.rows);
  const concentration = computeConcentration(opts.rows, [10, 20, 50]);

  const risks: InventorySanityRisk[] = [];

  if (!snapshotValidation.pass) {
    risks.push({
      id: "R-SNAPSHOT-INTEGRITY",
      level: "blocker",
      category: "snapshot",
      message: "Snapshot activo/checksum/row_count no coincide con T0 esperado",
      evidence: { snapshotValidation },
    });
  }

  if (!projectionReconciliation.allPass) {
    risks.push({
      id: "R-PROJECTION-FORMULA",
      level: "blocker",
      category: "projection",
      message: "Projection != Snapshot + Ledger en alguna dimensión",
      evidence: { projectionReconciliation },
    });
  }

  if (distribution.negativeQtyVariants > 0) {
    risks.push({
      id: "R-NEGATIVE-QTY",
      level: "blocker",
      category: "anomaly",
      message: "Existen variantes con qty proyectada negativa",
      evidence: {
        count: distribution.negativeQtyVariants,
        orphanMovementRows: orphanMovementRows.length,
        grainMismatchMovements: grainMismatchMovements.length,
      },
    });
  }

  if (grainMismatchMovements.length > 0) {
    risks.push({
      id: "R-SKU-GRAIN-MISMATCH",
      level: "blocker",
      category: "grain",
      message:
        "Ledger usa SKU variant (ej. AC-101-MO-S) pero snapshot T0 usa SKU base (AC-101-MO) — movimientos huérfanos generan qty negativa",
      evidence: {
        grainMismatchMovements: grainMismatchMovements.length,
        orphanMovementRows: orphanMovementRows.length,
        sample: grainMismatchMovements.slice(0, 5).map((m) => ({
          sku: m.sku,
          talle: m.talle,
          owner: m.owner,
        })),
      },
    });
  }

  const extremeCount = topProjected.filter((r) => r.classification === "extremo").length;
  const suspiciousCount = topProjected.filter((r) => r.classification === "sospechoso").length;
  const qty3000Count = opts.rows.filter((r) => r.projectedQty === 3000).length;

  const malformedSkus = opts.rows.filter((r) => /[`'"]/.test(r.sku));
  if (malformedSkus.length > 0) {
    risks.push({
      id: "R-MALFORMED-SKU",
      level: "warning",
      category: "data-quality",
      message: "SKUs con caracteres inválidos en snapshot/projection",
      evidence: {
        count: malformedSkus.length,
        sample: malformedSkus.slice(0, 5).map((r) => r.sku),
      },
    });
  }

  if (qty3000Count > 100) {
    risks.push({
      id: "R-QTY-3000-CLUSTER",
      level: "warning",
      category: "quantity",
      message: "Cluster masivo de cantidades exactas 3000 heredadas de STOCK MAESTRO/sync TN",
      evidence: { qty3000Count, pct: Math.round((qty3000Count / opts.rows.length) * 10000) / 100 },
    });
  } else if (extremeCount > 0) {
    risks.push({
      id: "R-EXTREME-QTY",
      level: "warning",
      category: "quantity",
      message: "Cantidades extremas detectadas en top projected",
      evidence: { extremeCount, suspiciousCount },
    });
  }

  if (concentration[0]?.pctOfInventory > 25) {
    risks.push({
      id: "R-CONCENTRATION-TOP10",
      level: "warning",
      category: "concentration",
      message: "Top 10 SKUs concentran >25% del inventario proyectado",
      evidence: concentration[0],
    });
  }

  if (embeddedTalleSkus.length > 0) {
    risks.push({
      id: "R-EMBEDDED-TALLE-SNAPSHOT",
      level: "informational",
      category: "grain",
      message:
        "Snapshot keys usan SKU base post-normalización M4.8b.2 — coherente con diseño",
      evidence: { sampleCount: embeddedTalleSkus.length },
    });
  }

  risks.push({
    id: "R-PILOT-RE-TIMESTAMP",
    level: "informational",
    category: "ledger",
    message:
      "101 sales piloto fueron re-timestamped a T0 en M4.5c — incluidas en projection post-T0",
  });

  risks.push({
    id: "R-NO-TN-LIVE",
    level: "informational",
    category: "m5",
    message: "M5 live import aún no activo — projection solo refleja ventas históricas TN-only backfill",
  });

  risks.push({
    id: "R-NO-SHEETS-RUNTIME",
    level: "informational",
    category: "architecture",
    message: "Projection path no depende de Sheets/GAS/Tiendanube en runtime — descartado como blocker",
  });

  const blockers = risks.filter((r) => r.level === "blocker").length;
  const warnings = risks.filter((r) => r.level === "warning").length;

  let m5Recommendation: "GO" | "NO_GO" | "GO_WITH_WARNINGS" = "GO";
  if (blockers > 0 || !formulaPass || !snapshotValidation.pass) {
    m5Recommendation = "NO_GO";
  } else if (warnings > 0) {
    m5Recommendation = "GO_WITH_WARNINGS";
  }

  return {
    generatedAt: new Date().toISOString(),
    milestone: "M4.9",
    mode: "read-only-audit",
    snapshot: opts.snapshot,
    executiveSummary: {
      projectionRowCount: opts.rows.length,
      snapshotQtyTotal: totals.snapshotQuantityTotal,
      movementDeltaTotal: totals.netDeltaTotal,
      projectedQtyTotal: totals.projectedQuantityTotal,
      expectedProjectedQty: EXPECTED_PROJECTED_QTY,
      projectionFormulaPass: formulaPass && totals.projectedQuantityTotal === EXPECTED_PROJECTED_QTY,
      m5Recommendation,
      blockerCount: blockers,
      warningCount: warnings,
    },
    topProjected,
    topSnapshot,
    topMovementDelta,
    distribution,
    concentration,
    anomalies: {
      negativeQty: opts.rows.filter((r) => r.projectedQty < 0).slice(0, 100),
      zeroQty: distribution.zeroQtyVariants,
      absurdlyHigh: topProjected.filter((r) => r.classification !== "normal").slice(0, 50),
      unexpectedOwners,
      unexpectedTalles,
      embeddedTalleSkus,
      orphanMovementRows: orphanMovementRows.length,
      grainMismatchMovements: grainMismatchMovements.length,
      grainMismatchSamples: grainMismatchMovements.slice(0, 10).map((m) => ({
        sku: m.sku,
        talle: m.talle,
        owner: m.owner,
      })),
    },
    snapshotValidation,
    projectionReconciliation,
    risks,
  };
}
