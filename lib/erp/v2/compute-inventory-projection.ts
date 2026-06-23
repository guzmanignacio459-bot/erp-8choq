export type ProjectionKey = {
  sku: string;
  talle: string;
  owner: string;
};

export type SnapshotLineInput = ProjectionKey & {
  quantity: number;
};

export type StockMovementDelta = {
  sku: string;
  talle: string | null;
  owner: string | null;
  quantity: number;
  direction: string;
  movementType?: string;
};

export type ProjectionRow = ProjectionKey & {
  snapshotQty: number;
  inQty: number;
  outQty: number;
  adjustQty: number;
  netDelta: number;
  projectedQty: number;
};

export type ProjectionTotals = {
  snapshotQuantityTotal: number;
  movementInTotal: number;
  movementOutTotal: number;
  movementAdjustTotal: number;
  netDeltaTotal: number;
  projectedQuantityTotal: number;
};

export type ActiveSnapshotMeta = {
  runId: string;
  snapshotDate: string;
  label: string;
  source: string;
  checksumSha256: string | null;
  rowCount: number;
};

function normalizeOwner(owner: string | null | undefined): string {
  return owner?.trim() || "8Q";
}

function normalizeTalle(talle: string | null | undefined): string {
  return talle?.trim() || "";
}

export function projectionKey(sku: string, talle: string, owner: string): string {
  return `${sku}\0${normalizeTalle(talle)}\0${normalizeOwner(owner)}`;
}

export function applyMovementDelta(
  current: number,
  move: Pick<StockMovementDelta, "quantity" | "direction">
): number {
  if (move.direction === "in") return current + move.quantity;
  if (move.direction === "out") return current - move.quantity;
  if (move.direction === "adjust") return current + move.quantity;
  return current;
}

type MutableProjection = ProjectionKey & {
  snapshotQty: number;
  inQty: number;
  outQty: number;
  adjustQty: number;
};

export function computeInventoryProjection(opts: {
  snapshotLines: SnapshotLineInput[];
  movements: StockMovementDelta[];
}): ProjectionRow[] {
  const map = new Map<string, MutableProjection>();

  for (const line of opts.snapshotLines) {
    const owner = normalizeOwner(line.owner);
    const talle = normalizeTalle(line.talle);
    const key = projectionKey(line.sku, talle, owner);
    map.set(key, {
      sku: line.sku,
      talle,
      owner,
      snapshotQty: line.quantity,
      inQty: 0,
      outQty: 0,
      adjustQty: 0,
    });
  }

  for (const move of opts.movements) {
    const owner = normalizeOwner(move.owner);
    const talle = normalizeTalle(move.talle);
    const key = projectionKey(move.sku, talle, owner);

    const row = map.get(key) ?? {
      sku: move.sku,
      talle,
      owner,
      snapshotQty: 0,
      inQty: 0,
      outQty: 0,
      adjustQty: 0,
    };

    if (move.direction === "in") {
      row.inQty += move.quantity;
    } else if (move.direction === "out") {
      row.outQty += move.quantity;
    } else if (move.direction === "adjust") {
      row.adjustQty += move.quantity;
    }

    map.set(key, row);
  }

  return [...map.values()]
    .map((row) => {
      const netDelta = row.inQty - row.outQty + row.adjustQty;
      return {
        sku: row.sku,
        talle: row.talle,
        owner: row.owner,
        snapshotQty: row.snapshotQty,
        inQty: row.inQty,
        outQty: row.outQty,
        adjustQty: row.adjustQty,
        netDelta,
        projectedQty: row.snapshotQty + netDelta,
      };
    })
    .sort((a, b) => {
      const sku = a.sku.localeCompare(b.sku);
      if (sku !== 0) return sku;
      const talle = a.talle.localeCompare(b.talle);
      if (talle !== 0) return talle;
      return a.owner.localeCompare(b.owner);
    });
}

export function summarizeProjection(rows: ProjectionRow[]): ProjectionTotals {
  return rows.reduce(
    (acc, row) => ({
      snapshotQuantityTotal: acc.snapshotQuantityTotal + row.snapshotQty,
      movementInTotal: acc.movementInTotal + row.inQty,
      movementOutTotal: acc.movementOutTotal + row.outQty,
      movementAdjustTotal: acc.movementAdjustTotal + row.adjustQty,
      netDeltaTotal: acc.netDeltaTotal + row.netDelta,
      projectedQuantityTotal: acc.projectedQuantityTotal + row.projectedQty,
    }),
    {
      snapshotQuantityTotal: 0,
      movementInTotal: 0,
      movementOutTotal: 0,
      movementAdjustTotal: 0,
      netDeltaTotal: 0,
      projectedQuantityTotal: 0,
    }
  );
}

export function computeProjectionForKey(
  rows: ProjectionRow[],
  key: ProjectionKey
): ProjectionRow | null {
  const target = projectionKey(key.sku, key.talle, key.owner);
  return rows.find((r) => projectionKey(r.sku, r.talle, r.owner) === target) ?? null;
}
