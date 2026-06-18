import { getPrisma } from "@/lib/db/prisma";
import {
  computeInventoryProjection,
  computeProjectionForKey,
  summarizeProjection,
  type ActiveSnapshotMeta,
  type ProjectionKey,
  type ProjectionRow,
  type ProjectionTotals,
  type StockMovementDelta,
} from "@/lib/erp/v2/compute-inventory-projection";

const INVENTORY_SNAPSHOT_SOURCE = "stock_maestro_bootstrap";

export type InventoryProjectionResult = {
  snapshot: ActiveSnapshotMeta;
  asOf: string;
  movementsPostT0: number;
  rows: ProjectionRow[];
  totals: ProjectionTotals;
};

async function loadActiveSnapshotMeta(): Promise<ActiveSnapshotMeta> {
  const prisma = getPrisma();
  const run = await prisma.inventorySnapshotRun.findFirst({
    where: { isActive: true, source: INVENTORY_SNAPSHOT_SOURCE },
    select: {
      id: true,
      snapshotDate: true,
      label: true,
      source: true,
      checksumSha256: true,
      rowCount: true,
    },
  });

  if (!run) {
    throw new Error("no active inventory snapshot run (T0)");
  }

  return {
    runId: run.id,
    snapshotDate: run.snapshotDate.toISOString(),
    label: run.label,
    source: run.source,
    checksumSha256: run.checksumSha256,
    rowCount: run.rowCount,
  };
}

async function loadProjectionInputs(runId: string, snapshotDate: Date) {
  const prisma = getPrisma();

  const [snapshotLines, movements] = await Promise.all([
    prisma.inventorySnapshotLine.findMany({
      where: { runId },
      select: { sku: true, talle: true, owner: true, quantity: true },
      orderBy: [{ sku: "asc" }, { talle: "asc" }, { owner: "asc" }],
    }),
    prisma.stockMovement.findMany({
      where: { createdAt: { gte: snapshotDate } },
      select: {
        sku: true,
        talle: true,
        owner: true,
        quantity: true,
        direction: true,
        movementType: true,
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return {
    snapshotLines,
    movements: movements.map(
      (m): StockMovementDelta => ({
        sku: m.sku,
        talle: m.talle,
        owner: m.owner,
        quantity: m.quantity,
        direction: m.direction,
        movementType: m.movementType,
      })
    ),
  };
}

export async function getActiveInventoryProjection(opts?: {
  asOf?: Date;
}): Promise<InventoryProjectionResult> {
  const snapshot = await loadActiveSnapshotMeta();
  const snapshotDate = new Date(snapshot.snapshotDate);
  const { snapshotLines, movements } = await loadProjectionInputs(
    snapshot.runId,
    snapshotDate
  );

  const rows = computeInventoryProjection({ snapshotLines, movements });

  return {
    snapshot,
    asOf: (opts?.asOf ?? new Date()).toISOString(),
    movementsPostT0: movements.length,
    rows,
    totals: summarizeProjection(rows),
  };
}

export async function getProjectionSummary(): Promise<{
  snapshot: ActiveSnapshotMeta;
  movementsPostT0: number;
  projectionRowCount: number;
  totals: ProjectionTotals;
}> {
  const result = await getActiveInventoryProjection();
  return {
    snapshot: result.snapshot,
    movementsPostT0: result.movementsPostT0,
    projectionRowCount: result.rows.length,
    totals: result.totals,
  };
}

export async function getProjectionBySku(sku: string): Promise<ProjectionRow[]> {
  const result = await getActiveInventoryProjection();
  const needle = sku.trim().toUpperCase();
  return result.rows.filter((r) => r.sku.toUpperCase() === needle);
}

export async function getProjectionForKey(key: ProjectionKey): Promise<ProjectionRow | null> {
  const result = await getActiveInventoryProjection();
  return computeProjectionForKey(result.rows, key);
}

export async function loadProjectionValidationInputs() {
  const snapshot = await loadActiveSnapshotMeta();
  const snapshotDate = new Date(snapshot.snapshotDate);
  const { snapshotLines, movements } = await loadProjectionInputs(
    snapshot.runId,
    snapshotDate
  );
  const rows = computeInventoryProjection({ snapshotLines, movements });

  return {
    snapshot,
    snapshotLines,
    movements,
    movementsPostT0: movements.length,
    rows,
    totals: summarizeProjection(rows),
  };
}
