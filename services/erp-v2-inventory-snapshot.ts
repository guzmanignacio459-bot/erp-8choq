import { getPrisma } from "@/lib/db/prisma";
import { readStockMaestroFromSheets } from "@/lib/erp/v2/read-stock-maestro";
import {
  unpivotStockMaestro,
  type SnapshotDraft,
} from "@/lib/erp/v2/unpivot-stock-maestro";
import {
  auditTopQuantities,
  buildWriteValidationReport,
  snapshotRunNotesT0,
  type InventorySnapshotWriteValidation,
  type TopQuantityAuditRow,
} from "@/lib/erp/v2/validate-inventory-snapshot-write";
import { validateSnapshotDraft } from "@/lib/erp/v2/validate-inventory-snapshot-draft";

export const INVENTORY_SNAPSHOT_SOURCE = "stock_maestro_bootstrap";

const LINE_BATCH_SIZE = 500;

export type BootstrapInventorySnapshotOpts = {
  snapshotDate?: Date;
  importedBy?: string;
  dryRun?: boolean;
};

export type BootstrapInventorySnapshotResult = {
  dryRun: boolean;
  snapshotDate: string;
  runId: string | null;
  label: string;
  rowCount: number;
  checksumSha256: string;
  draft: SnapshotDraft;
  preWriteValidation: ReturnType<typeof validateSnapshotDraft>;
  postWriteValidation: InventorySnapshotWriteValidation | null;
  topQuantities: TopQuantityAuditRow[];
  t0Declaration: string;
};

async function loadBootstrapDraft(
  snapshotDate: Date,
  label: string
): Promise<SnapshotDraft> {
  const sheet = await readStockMaestroFromSheets();
  return unpivotStockMaestro(sheet.sourceRows, {
    includeZeroQty: true,
    proposedSnapshotDate: snapshotDate.toISOString(),
    label,
    normalizeEmbeddedTalle: true,
    dedupeKeys: true,
  });
}

export async function bootstrapInventorySnapshot(
  opts?: BootstrapInventorySnapshotOpts
): Promise<BootstrapInventorySnapshotResult> {
  const dryRun = opts?.dryRun ?? false;
  const snapshotDate = opts?.snapshotDate ?? new Date();
  const label = `bootstrap-t0-${snapshotDate.toISOString().slice(0, 10)}`;

  const draft = await loadBootstrapDraft(snapshotDate, label);
  const preWriteValidation = validateSnapshotDraft(draft);

  if (!preWriteValidation.allPass) {
    throw new Error("pre-write validation failed (V-I1/V-I2)");
  }

  const topQuantities = auditTopQuantities(draft.lines, 100);
  const t0Declaration = snapshotRunNotesT0({
    snapshotDateIso: snapshotDate.toISOString(),
    checksum: draft.checksumSha256,
    rowCount: draft.lines.length,
  });

  if (dryRun) {
    return {
      dryRun: true,
      snapshotDate: snapshotDate.toISOString(),
      runId: null,
      label,
      rowCount: draft.lines.length,
      checksumSha256: draft.checksumSha256,
      draft,
      preWriteValidation,
      postWriteValidation: null,
      topQuantities,
      t0Declaration,
    };
  }

  const prisma = getPrisma();

  const existingActive = await prisma.inventorySnapshotRun.findFirst({
    where: { isActive: true, source: INVENTORY_SNAPSHOT_SOURCE },
    select: { id: true, snapshotDate: true },
  });
  if (existingActive) {
    throw new Error(
      `active inventory snapshot already exists: ${existingActive.id} @ ${existingActive.snapshotDate.toISOString()}`
    );
  }

  const run = await prisma.$transaction(async (tx) => {
    await tx.inventorySnapshotRun.updateMany({
      where: { source: INVENTORY_SNAPSHOT_SOURCE, isActive: true },
      data: { isActive: false },
    });

    const createdRun = await tx.inventorySnapshotRun.create({
      data: {
        snapshotDate,
        label,
        source: INVENTORY_SNAPSHOT_SOURCE,
        rowCount: draft.lines.length,
        isActive: true,
        importedBy: opts?.importedBy ?? "m4-inventory-snapshot-bootstrap",
        checksumSha256: draft.checksumSha256,
        notes: t0Declaration,
      },
    });

    for (let i = 0; i < draft.lines.length; i += LINE_BATCH_SIZE) {
      const batch = draft.lines.slice(i, i + LINE_BATCH_SIZE);
      await tx.inventorySnapshotLine.createMany({
        data: batch.map((line) => ({
          runId: createdRun.id,
          snapshotDate,
          sku: line.sku,
          talle: line.talle,
          owner: line.owner,
          quantity: line.quantity,
          source: INVENTORY_SNAPSHOT_SOURCE,
        })),
      });
    }

    return createdRun;
  });

  const persistedLines = await prisma.inventorySnapshotLine.findMany({
    where: { runId: run.id },
    select: { sku: true, talle: true, owner: true, quantity: true },
    orderBy: [{ sku: "asc" }, { talle: "asc" }, { owner: "asc" }],
  });

  const movementsAfterT0 = await prisma.stockMovement.findMany({
    where: { createdAt: { gte: snapshotDate } },
    select: {
      sku: true,
      talle: true,
      owner: true,
      quantity: true,
      direction: true,
      movementType: true,
      createdAt: true,
    },
  });

  const postWriteValidation = buildWriteValidationReport({
    lines: persistedLines,
    persistedChecksum: run.checksumSha256,
    movementsAfterT0Count: movementsAfterT0.length,
    movementsAfterT0,
  });

  if (!postWriteValidation.allPass) {
    throw new Error("post-write validation failed (V-I1..V-I4)");
  }

  return {
    dryRun: false,
    snapshotDate: snapshotDate.toISOString(),
    runId: run.id,
    label,
    rowCount: persistedLines.length,
    checksumSha256: run.checksumSha256 ?? draft.checksumSha256,
    draft,
    preWriteValidation,
    postWriteValidation,
    topQuantities,
    t0Declaration,
  };
}

export async function getActiveInventorySnapshotRun() {
  const prisma = getPrisma();
  return prisma.inventorySnapshotRun.findFirst({
    where: { isActive: true, source: INVENTORY_SNAPSHOT_SOURCE },
    include: { _count: { select: { lines: true } } },
  });
}
