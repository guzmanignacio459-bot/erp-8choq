-- M4.8 — inventory_snapshot_runs + inventory_snapshot_lines (staging Neon)
-- Fuente de verdad: prisma/schema.prisma
-- Aplicar en M4.8c vía npm run m4:db:push (NO ejecutar en M4.8b dry-run)
-- Ver docs/erp-m4-inventory-projection-adr.md

CREATE TABLE "inventory_snapshot_runs" (
    "id" TEXT NOT NULL,
    "snapshot_date" TIMESTAMP(3) NOT NULL,
    "label" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'stock_maestro_bootstrap',
    "row_count" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "imported_by" TEXT,
    "checksum_sha256" TEXT,
    "notes" TEXT,
    CONSTRAINT "inventory_snapshot_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "inventory_snapshot_runs_snapshot_date_source_key"
  ON "inventory_snapshot_runs"("snapshot_date", "source");

CREATE TABLE "inventory_snapshot_lines" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "snapshot_date" TIMESTAMP(3) NOT NULL,
    "sku" TEXT NOT NULL,
    "talle" TEXT NOT NULL,
    "owner" TEXT NOT NULL DEFAULT '8Q',
    "quantity" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'stock_maestro_bootstrap',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "inventory_snapshot_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "inventory_snapshot_lines_run_id_sku_talle_owner_key"
  ON "inventory_snapshot_lines"("run_id", "sku", "talle", "owner");

CREATE INDEX "inventory_snapshot_lines_sku_talle_idx"
  ON "inventory_snapshot_lines"("sku", "talle");

CREATE INDEX "inventory_snapshot_lines_snapshot_date_idx"
  ON "inventory_snapshot_lines"("snapshot_date");

ALTER TABLE "inventory_snapshot_lines"
  ADD CONSTRAINT "inventory_snapshot_lines_run_id_fkey"
  FOREIGN KEY ("run_id") REFERENCES "inventory_snapshot_runs"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
