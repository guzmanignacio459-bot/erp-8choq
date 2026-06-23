import fs from "fs";
import path from "path";

import {
  computeInventoryProjection,
  summarizeProjection,
  type ProjectionRow,
  type ProjectionTotals,
} from "@/lib/erp/v2/compute-inventory-projection";

export type InventoryProjectionValidation = {
  vI3: {
    id: "V-I3";
    pass: boolean;
    snapshotRowCount: number;
    projectionRowCount: number;
    movementsPostT0: number;
    quantityDelta: number;
  };
  vI4: {
    id: "V-I4";
    pass: boolean;
    recomputedMatchesProjection: boolean;
    quantityDelta: number;
  };
  vI5: {
    id: "V-I5";
    pass: boolean;
    forbiddenImports: string[];
    auditedFiles: string[];
  };
  vI6: {
    id: "V-I6";
    pass: boolean;
    forbiddenImports: string[];
    auditedFiles: string[];
  };
  allPass: boolean;
};

const PROJECTION_RUNTIME_FILES = [
  "lib/erp/v2/compute-inventory-projection.ts",
  "services/erp-v2-inventory-projection.ts",
  "lib/erp/v2/validate-inventory-projection.ts",
  "scripts/m4-inventory-projection-verify.ts",
] as const;

const V_I5_FORBIDDEN = [
  "tiendanube",
  "@/lib/tiendanube",
  "api.tiendanube.com",
];

const V_I6_FORBIDDEN = [
  "googleapis",
  "googleSheets",
  "read-stock-maestro",
  "STOCK MAESTRO",
  "erp-8q.gs",
];

function readSource(relativePath: string): string {
  const abs = path.join(process.cwd(), relativePath);
  return fs.readFileSync(abs, "utf8");
}

function extractImportSurface(source: string): string {
  return source
    .split("\n")
    .filter((line) => /^\s*import\s/.test(line) || /\brequire\s*\(/.test(line))
    .join("\n")
    .toLowerCase();
}

export function auditStaticRuntimeDependencies(): {
  vI5: InventoryProjectionValidation["vI5"];
  vI6: InventoryProjectionValidation["vI6"];
} {
  const vI5Hits = new Set<string>();
  const vI6Hits = new Set<string>();

  const runtimeFiles = PROJECTION_RUNTIME_FILES.filter(
    (f) => f !== "lib/erp/v2/validate-inventory-projection.ts"
  );

  for (const file of runtimeFiles) {
    const source = extractImportSurface(readSource(file));
    for (const token of V_I5_FORBIDDEN) {
      if (source.includes(token.toLowerCase())) vI5Hits.add(`${file}:${token}`);
    }
    for (const token of V_I6_FORBIDDEN) {
      if (source.includes(token.toLowerCase())) vI6Hits.add(`${file}:${token}`);
    }
  }

  return {
    vI5: {
      id: "V-I5",
      pass: vI5Hits.size === 0,
      forbiddenImports: [...vI5Hits],
      auditedFiles: [...runtimeFiles],
    },
    vI6: {
      id: "V-I6",
      pass: vI6Hits.size === 0,
      forbiddenImports: [...vI6Hits],
      auditedFiles: [...runtimeFiles],
    },
  };
}

export function validateProjectionEqualsSnapshotAtT0(opts: {
  snapshotRows: ProjectionRow[];
  projectionRows: ProjectionRow[];
  movementsPostT0: number;
}): InventoryProjectionValidation["vI3"] {
  let quantityDelta = 0;

  const projectionByKey = new Map(
    opts.projectionRows.map((r) => [`${r.sku}\0${r.talle}\0${r.owner}`, r])
  );

  for (const snap of opts.snapshotRows) {
    const key = `${snap.sku}\0${snap.talle}\0${snap.owner}`;
    const projected = projectionByKey.get(key);
    const projectedQty = projected?.projectedQty ?? 0;
    quantityDelta += Math.abs(projectedQty - snap.snapshotQty);
  }

  const pass =
    opts.movementsPostT0 === 0 &&
    opts.snapshotRows.length === opts.projectionRows.length &&
    quantityDelta === 0;

  return {
    id: "V-I3",
    pass,
    snapshotRowCount: opts.snapshotRows.length,
    projectionRowCount: opts.projectionRows.length,
    movementsPostT0: opts.movementsPostT0,
    quantityDelta,
  };
}

export function validateProjectionEqualsSnapshotPlusLedger(opts: {
  snapshotLines: Array<{ sku: string; talle: string; owner: string; quantity: number }>;
  movements: Array<{
    sku: string;
    talle: string | null;
    owner: string | null;
    quantity: number;
    direction: string;
  }>;
  projectionRows: ProjectionRow[];
}): InventoryProjectionValidation["vI4"] {
  const recomputed = computeInventoryProjection({
    snapshotLines: opts.snapshotLines,
    movements: opts.movements,
  });

  const recomputedMap = new Map(
    recomputed.map((r) => [`${r.sku}\0${r.talle}\0${r.owner}`, r.projectedQty])
  );
  const projectionMap = new Map(
    opts.projectionRows.map((r) => [`${r.sku}\0${r.talle}\0${r.owner}`, r.projectedQty])
  );

  let quantityDelta = 0;
  const keys = new Set([...recomputedMap.keys(), ...projectionMap.keys()]);

  for (const key of keys) {
    quantityDelta += Math.abs((recomputedMap.get(key) ?? 0) - (projectionMap.get(key) ?? 0));
  }

  return {
    id: "V-I4",
    pass: quantityDelta === 0,
    recomputedMatchesProjection: quantityDelta === 0,
    quantityDelta,
  };
}

export function validateInventoryProjection(opts: {
  snapshotLines: Array<{ sku: string; talle: string; owner: string; quantity: number }>;
  movements: Array<{
    sku: string;
    talle: string | null;
    owner: string | null;
    quantity: number;
    direction: string;
    movementType?: string;
  }>;
  projectionRows: ProjectionRow[];
  movementsPostT0: number;
}): InventoryProjectionValidation {
  const snapshotRows: ProjectionRow[] = opts.snapshotLines.map((l) => ({
    sku: l.sku,
    talle: l.talle,
    owner: l.owner,
    snapshotQty: l.quantity,
    inQty: 0,
    outQty: 0,
    adjustQty: 0,
    netDelta: 0,
    projectedQty: l.quantity,
  }));

  const staticAudit = auditStaticRuntimeDependencies();
  const vI3 = validateProjectionEqualsSnapshotAtT0({
    snapshotRows,
    projectionRows: opts.projectionRows,
    movementsPostT0: opts.movementsPostT0,
  });
  const vI4 = validateProjectionEqualsSnapshotPlusLedger({
    snapshotLines: opts.snapshotLines,
    movements: opts.movements,
    projectionRows: opts.projectionRows,
  });

  return {
    vI3,
    vI4,
    vI5: staticAudit.vI5,
    vI6: staticAudit.vI6,
    allPass: vI3.pass && vI4.pass && staticAudit.vI5.pass && staticAudit.vI6.pass,
  };
}

export type { ProjectionTotals };
