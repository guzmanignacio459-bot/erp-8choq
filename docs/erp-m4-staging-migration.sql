-- M4.1 — tn_order_item_units (staging Neon)
-- Fuente de verdad: prisma/schema.prisma + npm run m4:db:push
-- Ver docs/erp-m4-tn-item-units-adr.md

CREATE TABLE "tn_order_item_units" (
    "id" TEXT NOT NULL,
    "tn_order_id" TEXT NOT NULL,
    "tn_order_item_id" TEXT NOT NULL,
    "unit_index" INTEGER NOT NULL,
    "sku" TEXT,
    "talle" TEXT,
    "owner" TEXT,
    "unit_price" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "is_gifty" BOOLEAN NOT NULL DEFAULT false,
    "is_stockable" BOOLEAN NOT NULL DEFAULT true,
    "parse_warnings" JSONB,
    "source" TEXT NOT NULL DEFAULT 'm4_unit_expand',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tn_order_item_units_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tn_order_item_units_tn_order_item_id_unit_index_key"
  ON "tn_order_item_units"("tn_order_item_id", "unit_index");

CREATE INDEX "tn_order_item_units_tn_order_id_idx" ON "tn_order_item_units"("tn_order_id");
CREATE INDEX "tn_order_item_units_sku_idx" ON "tn_order_item_units"("sku");
CREATE INDEX "tn_order_item_units_is_stockable_idx" ON "tn_order_item_units"("is_stockable");

ALTER TABLE "stock_movements" ADD COLUMN "tn_order_item_unit_id" TEXT;

CREATE INDEX "stock_movements_tn_order_item_unit_id_idx"
  ON "stock_movements"("tn_order_item_unit_id");

ALTER TABLE "tn_order_item_units"
  ADD CONSTRAINT "tn_order_item_units_tn_order_id_fkey"
  FOREIGN KEY ("tn_order_id") REFERENCES "tn_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tn_order_item_units"
  ADD CONSTRAINT "tn_order_item_units_tn_order_item_id_fkey"
  FOREIGN KEY ("tn_order_item_id") REFERENCES "tn_order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_tn_order_item_unit_id_fkey"
  FOREIGN KEY ("tn_order_item_unit_id") REFERENCES "tn_order_item_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
