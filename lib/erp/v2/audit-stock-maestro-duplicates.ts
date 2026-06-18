import { inferSnapshotOwner } from "@/lib/erp/v2/infer-snapshot-owner";
import { parseTnSku } from "@/lib/erp/v2/parse-tn-sku";
import type { StockMaestroRow } from "@/lib/erp/v2/read-stock-maestro";
import { STOCK_MAESTRO_SIZE_COLUMNS } from "@/lib/erp/v2/stock-maestro-constants";
import { unpivotStockMaestro } from "@/lib/erp/v2/unpivot-stock-maestro";

export type DuplicateClassification =
  | "duplicado_real"
  | "variante_valida"
  | "grain_inconsistente"
  | "sku_talle_embebido"
  | "otro";

export type CleanupAction = "excluir" | "consolidar" | "corregir" | "revisar_manualmente";

export type EmptyRowClassification =
  | "fila_vacia"
  | "subtotal"
  | "encabezado"
  | "separador"
  | "otro";

export type DuplicateRowDetail = {
  rowIndex: number;
  owner: string;
  embeddedTalle: string | null;
  talles: Record<string, number>;
  stockTotal: number | null;
  articulo: string;
  sizeGridFingerprint: string;
  nonzeroSizeCount: number;
  rowTotalQty: number;
};

export type DuplicateSkuAudit = {
  sku: string;
  occurrenceCount: number;
  owner: string;
  embeddedTalle: string | null;
  suggestedBaseSku: string | null;
  classification: DuplicateClassification;
  cleanupAction: CleanupAction;
  classificationReason: string;
  collisionKeyCount: number;
  rows: DuplicateRowDetail[];
  gridsIdentical: boolean;
  gridsDistinctCount: number;
  conflictScore: number;
};

export type EmptySkuRowAudit = {
  rowIndex: number;
  articulo: string;
  stockTotal: number | null;
  talles: Record<string, number>;
  rowTotalQty: number;
  classification: EmptyRowClassification;
  cleanupAction: CleanupAction;
  classificationReason: string;
};

export type StockMaestroDuplicatesAudit = {
  duplicateSkus: DuplicateSkuAudit[];
  emptySkuRows: EmptySkuRowAudit[];
  summary: {
    duplicateSkuCount: number;
    collisionKeyCount: number;
    emptySkuRowCount: number;
    byDuplicateClassification: Record<DuplicateClassification, number>;
    byEmptyRowClassification: Record<EmptyRowClassification, number>;
    byCleanupActionDuplicates: Record<CleanupAction, number>;
    byCleanupActionEmptyRows: Record<CleanupAction, number>;
  };
  recommendations: string[];
};

function rowTotalQty(row: StockMaestroRow): number {
  return STOCK_MAESTRO_SIZE_COLUMNS.reduce((sum, t) => sum + (row.sizes[t] || 0), 0);
}

function sizeGridFingerprint(row: StockMaestroRow): string {
  return STOCK_MAESTRO_SIZE_COLUMNS.map((t) => `${t}:${row.sizes[t] ?? 0}`).join("|");
}

function nonzeroSizeCount(row: StockMaestroRow): number {
  return STOCK_MAESTRO_SIZE_COLUMNS.filter((t) => (row.sizes[t] ?? 0) !== 0).length;
}

function deriveBaseSku(sku: string): string | null {
  const parsed = parseTnSku(sku);
  if (!parsed.talle) return null;
  const suffix = `-${parsed.talle}`;
  const ownerSuffix = parsed.owner === "SCNL" ? "-SCNL" : "";
  if (sku.endsWith(`${suffix}${ownerSuffix}`)) {
    return sku.slice(0, -(suffix.length + ownerSuffix.length));
  }
  if (sku.endsWith(suffix)) {
    return sku.slice(0, -suffix.length);
  }
  return null;
}

function classifyDuplicateSku(
  sku: string,
  rows: StockMaestroRow[],
  collisionKeyCount: number
): Pick<
  DuplicateSkuAudit,
  "classification" | "cleanupAction" | "classificationReason"
> {
  const parsed = parseTnSku(sku);
  const fingerprints = new Set(rows.map(sizeGridFingerprint));
  const gridsIdentical = fingerprints.size === 1;
  const embedded = Boolean(parsed.talle);
  const consecutive =
    rows.length > 1 &&
    rows.every((r, i) => i === 0 || r.rowIndex === rows[i - 1].rowIndex + 1);

  if (embedded && rows.some((r) => nonzeroSizeCount(r) > 1)) {
    return {
      classification: "sku_talle_embebido",
      cleanupAction: "corregir",
      classificationReason:
        "SKU ya incluye talle pero la fila tiene grilla multi-talle; grain ERP debe ser base SKU + columnas",
    };
  }

  if (embedded && collisionKeyCount > 0) {
    return {
      classification: "sku_talle_embebido",
      cleanupAction: "revisar_manualmente",
      classificationReason:
        "SKU con talle embebido repetido; al unpivot colisiona con grain snapshot",
    };
  }

  if (!gridsIdentical) {
    return {
      classification: "grain_inconsistente",
      cleanupAction: "revisar_manualmente",
      classificationReason: "Mismo SKU con grillas de talles distintas entre filas",
    };
  }

  if (gridsIdentical && rows.length > 1) {
    return {
      classification: "duplicado_real",
      cleanupAction: consecutive ? "excluir" : "consolidar",
      classificationReason: consecutive
        ? "Filas consecutivas idénticas — copia accidental"
        : "Filas repetidas con grilla idéntica — consolidar en una",
    };
  }

  return {
    classification: "otro",
    cleanupAction: "revisar_manualmente",
    classificationReason: "Patrón no clasificado automáticamente",
  };
}

function classifyEmptyRow(row: StockMaestroRow): Pick<
  EmptySkuRowAudit,
  "classification" | "cleanupAction" | "classificationReason"
> {
  const articulo = row.articulo.trim();
  const total = rowTotalQty(row);
  const hasStockTotal = row.stockTotal !== null && row.stockTotal !== 0;
  const hasArticulo = articulo.length > 0;

  if (!hasArticulo && total === 0 && !hasStockTotal) {
    return {
      classification: "fila_vacia",
      cleanupAction: "excluir",
      classificationReason: "Sin SKU, artículo ni cantidades",
    };
  }

  if (/^(TOTAL|SUBTOTAL|SUMA|RESUMEN)\b/i.test(articulo)) {
    return {
      classification: "subtotal",
      cleanupAction: "excluir",
      classificationReason: "Texto de subtotal/resumen sin SKU",
    };
  }

  if (hasArticulo && total === 0 && !hasStockTotal && articulo.length < 60) {
    const looksHeader =
      articulo === articulo.toUpperCase() &&
      !/\d/.test(articulo) &&
      articulo.split(/\s+/).length <= 6;
    if (looksHeader) {
      return {
        classification: "encabezado",
        cleanupAction: "excluir",
        classificationReason: "Artículo tipo sección sin SKU ni stock",
      };
    }
  }

  if (!hasArticulo && (total > 0 || hasStockTotal)) {
    const uniformPlaceholder = STOCK_MAESTRO_SIZE_COLUMNS.every(
      (t) => row.sizes[t] === 3000
    );
    if (uniformPlaceholder) {
      return {
        classification: "otro",
        cleanupAction: "excluir",
        classificationReason:
          "Grilla uniforme 3000 sin SKU — artefacto probable sync TN; excluir del bootstrap",
      };
    }
    return {
      classification: "otro",
      cleanupAction: "revisar_manualmente",
      classificationReason: "Cantidades sin SKU ni artículo",
    };
  }

  if (hasArticulo && (total > 0 || hasStockTotal)) {
    return {
      classification: "otro",
      cleanupAction: "revisar_manualmente",
      classificationReason: "Stock presente pero SKU ausente — posible fila huérfana",
    };
  }

  if (!hasArticulo && total === 0) {
    return {
      classification: "separador",
      cleanupAction: "excluir",
      classificationReason: "Fila espaciadora sin contenido operativo",
    };
  }

  return {
    classification: "otro",
    cleanupAction: "revisar_manualmente",
    classificationReason: "No coincide con heurísticas estándar",
  };
}

function countCollisionsForSku(
  sku: string,
  allRows: StockMaestroRow[]
): number {
  const subset = allRows.filter((r) => r.sku === sku);
  const draft = unpivotStockMaestro(subset, { includeZeroQty: true });
  const keys = new Map<string, number>();
  for (const line of draft.lines) {
    const key = `${line.sku}\0${line.talle}\0${line.owner}`;
    keys.set(key, (keys.get(key) ?? 0) + 1);
  }
  return [...keys.values()].filter((c) => c > 1).length;
}

function conflictScore(a: DuplicateSkuAudit): number {
  const qtyVariance = a.gridsDistinctCount > 1 ? 2 : 1;
  return a.occurrenceCount * a.collisionKeyCount * qtyVariance;
}

function initCountRecord<T extends string>(keys: readonly T[]): Record<T, number> {
  return Object.fromEntries(keys.map((k) => [k, 0])) as Record<T, number>;
}

export function auditStockMaestroDuplicates(
  sourceRows: StockMaestroRow[]
): StockMaestroDuplicatesAudit {
  const bySku = new Map<string, StockMaestroRow[]>();
  for (const row of sourceRows) {
    if (!row.sku) continue;
    const list = bySku.get(row.sku) ?? [];
    list.push(row);
    bySku.set(row.sku, list);
  }

  const duplicateSkus: DuplicateSkuAudit[] = [];

  for (const [sku, rows] of bySku) {
    if (rows.length < 2) continue;

    rows.sort((a, b) => a.rowIndex - b.rowIndex);
    const parsed = parseTnSku(sku);
    const collisionKeyCount = countCollisionsForSku(sku, sourceRows);
    const fingerprints = new Set(rows.map(sizeGridFingerprint));

    const base: DuplicateSkuAudit = {
      sku,
      occurrenceCount: rows.length,
      owner: inferSnapshotOwner(sku),
      embeddedTalle: parsed.talle,
      suggestedBaseSku: deriveBaseSku(sku),
      classification: "otro",
      cleanupAction: "revisar_manualmente",
      classificationReason: "",
      collisionKeyCount,
      rows: rows.map((row) => ({
        rowIndex: row.rowIndex,
        owner: inferSnapshotOwner(row.sku),
        embeddedTalle: parseTnSku(row.sku).talle,
        talles: { ...row.sizes },
        stockTotal: row.stockTotal,
        articulo: row.articulo,
        sizeGridFingerprint: sizeGridFingerprint(row),
        nonzeroSizeCount: nonzeroSizeCount(row),
        rowTotalQty: rowTotalQty(row),
      })),
      gridsIdentical: fingerprints.size === 1,
      gridsDistinctCount: fingerprints.size,
      conflictScore: 0,
    };

    const classified = classifyDuplicateSku(sku, rows, collisionKeyCount);
    base.classification = classified.classification;
    base.cleanupAction = classified.cleanupAction;
    base.classificationReason = classified.classificationReason;
    base.conflictScore = conflictScore(base);

    duplicateSkus.push(base);
  }

  duplicateSkus.sort((a, b) => b.conflictScore - a.conflictScore);

  const emptySkuRows: EmptySkuRowAudit[] = sourceRows
    .filter((r) => !r.sku)
    .map((row) => {
      const classified = classifyEmptyRow(row);
      return {
        rowIndex: row.rowIndex,
        articulo: row.articulo,
        stockTotal: row.stockTotal,
        talles: { ...row.sizes },
        rowTotalQty: rowTotalQty(row),
        classification: classified.classification,
        cleanupAction: classified.cleanupAction,
        classificationReason: classified.classificationReason,
      };
    });

  const draft = unpivotStockMaestro(sourceRows, { includeZeroQty: true });
  const collisionKeys = new Map<string, number>();
  for (const line of draft.lines) {
    const key = `${line.sku}\0${line.talle}\0${line.owner}`;
    collisionKeys.set(key, (collisionKeys.get(key) ?? 0) + 1);
  }
  const collisionKeyCount = [...collisionKeys.values()].filter((c) => c > 1).length;

  const byDuplicateClassification = initCountRecord<DuplicateClassification>([
    "duplicado_real",
    "variante_valida",
    "grain_inconsistente",
    "sku_talle_embebido",
    "otro",
  ]);
  const byEmptyRowClassification = initCountRecord<EmptyRowClassification>([
    "fila_vacia",
    "subtotal",
    "encabezado",
    "separador",
    "otro",
  ]);
  const byCleanupActionDuplicates = initCountRecord<CleanupAction>([
    "excluir",
    "consolidar",
    "corregir",
    "revisar_manualmente",
  ]);
  const byCleanupActionEmptyRows = initCountRecord<CleanupAction>([
    "excluir",
    "consolidar",
    "corregir",
    "revisar_manualmente",
  ]);

  for (const d of duplicateSkus) {
    byDuplicateClassification[d.classification] += 1;
    byCleanupActionDuplicates[d.cleanupAction] += 1;
  }
  for (const e of emptySkuRows) {
    byEmptyRowClassification[e.classification] += 1;
    byCleanupActionEmptyRows[e.cleanupAction] += 1;
  }

  const recommendations = buildRecommendations(
    duplicateSkus,
    emptySkuRows,
    collisionKeyCount
  );

  return {
    duplicateSkus,
    emptySkuRows,
    summary: {
      duplicateSkuCount: duplicateSkus.length,
      collisionKeyCount,
      emptySkuRowCount: emptySkuRows.length,
      byDuplicateClassification,
      byEmptyRowClassification,
      byCleanupActionDuplicates,
      byCleanupActionEmptyRows,
    },
    recommendations,
  };
}

function buildRecommendations(
  duplicateSkus: DuplicateSkuAudit[],
  emptySkuRows: EmptySkuRowAudit[],
  collisionKeyCount: number
): string[] {
  const recs: string[] = [];

  const excluirDupes = duplicateSkus.filter((d) => d.cleanupAction === "excluir").length;
  const consolidarDupes = duplicateSkus.filter((d) => d.cleanupAction === "consolidar").length;
  const corregirDupes = duplicateSkus.filter((d) => d.cleanupAction === "corregir").length;
  const manualDupes = duplicateSkus.filter((d) => d.cleanupAction === "revisar_manualmente")
    .length;

  const excluirEmpty = emptySkuRows.filter((e) => e.cleanupAction === "excluir").length;
  const manualEmpty = emptySkuRows.filter((e) => e.cleanupAction === "revisar_manualmente")
    .length;

  recs.push(
    `V-I2: excluir ${excluirEmpty} filas sin SKU (${emptySkuRows.length} total); revisar manualmente ${manualEmpty} filas con stock sin SKU`
  );
  recs.push(
    `V-I1: ${duplicateSkus.length} SKUs duplicados → excluir ${excluirDupes}, consolidar ${consolidarDupes}, corregir grain ${corregirDupes}, manual ${manualDupes}`
  );
  recs.push(
    `Tras limpieza: re-run m4:inventory:snapshot:dry-run hasta collision keys = 0 (actual: ${collisionKeyCount})`
  );

  const embedded = duplicateSkus.filter((d) => d.classification === "sku_talle_embebido");
  if (embedded.length) {
    recs.push(
      `${embedded.length} SKUs con talle embebido: normalizar a SKU base + grilla o dejar solo celda del talle correspondiente`
    );
  }

  if (manualEmpty > 0) {
    recs.push(
      `${manualEmpty} filas sin SKU con cantidades requieren asignación de SKU o exclusión antes de T0`
    );
  }

  recs.push("No declarar T0 hasta V-I1 PASS y V-I2 PASS en dry-run posterior");

  return recs;
}

export function topConflictiveDuplicates(
  audit: StockMaestroDuplicatesAudit,
  limit = 20
): DuplicateSkuAudit[] {
  return audit.duplicateSkus.slice(0, limit);
}
