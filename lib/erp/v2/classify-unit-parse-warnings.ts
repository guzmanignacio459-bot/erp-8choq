/**
 * Clasificación parse_warnings — M4.5 auditoría
 */

export const BLOCKING_PARSE_WARNING_CODES = new Set([
  "missing_sku",
  "invalid_talle",
]);

export const INFORMATIONAL_PARSE_WARNING_CODES = new Set<string>([]);

export type UnitParseWarningInput = {
  id: string;
  tnOrderId: string;
  sku: string | null;
  talle: string | null;
  owner: string | null;
  isGifty: boolean;
  isStockable: boolean;
  parseWarnings: unknown;
};

export type ClassifiedUnitWarning = {
  unitId: string;
  tnOrderId: string;
  codes: string[];
  blocking: string[];
  informational: string[];
  missingOwner: boolean;
  missingTalle: boolean;
  invalidSku: boolean;
  blocksSale: boolean;
  blockReasons: string[];
};

function normalizeWarnings(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }
  return [];
}

export function unitIsSaleEligible(unit: UnitParseWarningInput): boolean {
  return (
    unit.isStockable &&
    !unit.isGifty &&
    Boolean(String(unit.sku ?? "").trim()) &&
    Boolean(String(unit.talle ?? "").trim())
  );
}

export function classifyUnitParseWarnings(
  unit: UnitParseWarningInput
): ClassifiedUnitWarning {
  const codes = normalizeWarnings(unit.parseWarnings);
  const blocking = codes.filter((c) => BLOCKING_PARSE_WARNING_CODES.has(c));
  const informational = codes.filter((c) =>
    INFORMATIONAL_PARSE_WARNING_CODES.has(c)
  );

  const sku = String(unit.sku ?? "").trim();
  const talle = String(unit.talle ?? "").trim();
  const owner = String(unit.owner ?? "").trim();

  const missingOwner = !owner;
  const missingTalle = !talle;
  const invalidSku = !sku;

  const blockReasons: string[] = [];

  if (unit.isGifty) blockReasons.push("is_gifty");
  if (!unit.isStockable) blockReasons.push("not_stockable");
  if (invalidSku) blockReasons.push("missing_sku");
  if (missingTalle) blockReasons.push("missing_talle");
  if (missingOwner) blockReasons.push("missing_owner");
  for (const b of blocking) {
    if (!blockReasons.includes(b)) blockReasons.push(b);
  }

  return {
    unitId: unit.id,
    tnOrderId: unit.tnOrderId,
    codes,
    blocking,
    informational,
    missingOwner,
    missingTalle,
    invalidSku,
    blocksSale: blockReasons.length > 0 || !unitIsSaleEligible(unit),
    blockReasons,
  };
}

export type ParseWarningsAuditReport = {
  scope: string;
  totalUnits: number;
  stockableUnits: number;
  giftyUnits: number;
  unitsWithWarnings: number;
  blockingUnits: number;
  informationalOnlyUnits: number;
  eligibleForSale: number;
  byWarningCode: Array<{ code: string; count: number; blocking: boolean }>;
  byBlockReason: Array<{ reason: string; count: number }>;
  impact: {
    preventsMovements: number;
    allowsMovements: number;
    pctEligible: number;
  };
};

export function summarizeParseWarningsAudit(
  units: UnitParseWarningInput[],
  scope = "global"
): ParseWarningsAuditReport {
  const classified = units.map((u) => ({
    unit: u,
    c: classifyUnitParseWarnings(u),
  }));

  const codeCounts = new Map<string, number>();
  const reasonCounts = new Map<string, number>();

  let stockableUnits = 0;
  let giftyUnits = 0;
  let unitsWithWarnings = 0;
  let blockingUnits = 0;
  let informationalOnlyUnits = 0;
  let eligibleForSale = 0;

  for (const { unit, c } of classified) {
    if (unit.isStockable) stockableUnits += 1;
    if (unit.isGifty) giftyUnits += 1;
    if (c.codes.length) unitsWithWarnings += 1;
    if (c.blocksSale) blockingUnits += 1;
    else if (c.informational.length) informationalOnlyUnits += 1;
    if (!c.blocksSale && unitIsSaleEligible(unit)) eligibleForSale += 1;

    for (const code of c.codes) {
      codeCounts.set(code, (codeCounts.get(code) ?? 0) + 1);
    }
    for (const r of c.blockReasons) {
      reasonCounts.set(r, (reasonCounts.get(r) ?? 0) + 1);
    }
  }

  return {
    scope,
    totalUnits: units.length,
    stockableUnits,
    giftyUnits,
    unitsWithWarnings,
    blockingUnits,
    informationalOnlyUnits,
    eligibleForSale,
    byWarningCode: [...codeCounts.entries()]
      .map(([code, count]) => ({
        code,
        count,
        blocking: BLOCKING_PARSE_WARNING_CODES.has(code),
      }))
      .sort((a, b) => b.count - a.count),
    byBlockReason: [...reasonCounts.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count),
    impact: {
      preventsMovements: blockingUnits,
      allowsMovements: eligibleForSale,
      pctEligible: units.length
        ? Math.round((eligibleForSale / units.length) * 10000) / 100
        : 0,
    },
  };
}

export function saleIdempotencyKey(tnOrderItemUnitId: string): string {
  return `${tnOrderItemUnitId}:sale`;
}
