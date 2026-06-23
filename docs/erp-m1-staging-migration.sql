-- M1 TN-first — SQL incremental aplicado en Neon staging (2026-05)
-- Fuente de verdad: prisma/schema.prisma + npm run m1:db:push
-- Ver docs/erp-m0-tn-first-adr.md

-- Enums nuevos: TnOrderChannel, TnCommercialStatus, TnFulfillmentStatus, ErpOrderSource

CREATE TABLE "tn_order_item_allocations" (
    "id" TEXT NOT NULL,
    "tn_order_id" TEXT NOT NULL,
    "tn_order_item_id" TEXT NOT NULL,
    "discount_allocated" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "shipping_allocated" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "fee_allocated" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "neto_prenda" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "neto_prenda_real" DECIMAL(14,2),
    "mp_fee_allocated_real" DECIMAL(14,2),
    "mp_platform_fee_allocated_real" DECIMAL(14,2),
    "mp_total_cost_allocated_real" DECIMAL(14,2),
    "owner" TEXT,
    "neto_prenda_scnl" DECIMAL(14,2),
    "neto_prenda_8q" DECIMAL(14,2),
    "source" TEXT NOT NULL DEFAULT 'pending_engine',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tn_order_item_allocations_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "erp_orders" ADD COLUMN "order_source" "ErpOrderSource" NOT NULL DEFAULT 'legacy_gas_import';

ALTER TABLE "payments" ADD COLUMN "tn_order_id" TEXT,
  ALTER COLUMN "erp_order_id" DROP NOT NULL;

ALTER TABLE "stock_movements" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'pending_engine',
  ADD COLUMN "tn_order_id" TEXT,
  ADD COLUMN "tn_order_item_id" TEXT,
  ALTER COLUMN "erp_order_id" DROP NOT NULL;

ALTER TABLE "tn_order_items" ADD COLUMN "owner" TEXT;

ALTER TABLE "tn_orders" ADD COLUMN "allocated_at" TIMESTAMP(3),
  ADD COLUMN "channel" "TnOrderChannel" NOT NULL DEFAULT 'ecommerce',
  ADD COLUMN "commercial_status" "TnCommercialStatus",
  ADD COLUMN "commercial_status_at" TIMESTAMP(3),
  ADD COLUMN "customer_dni" TEXT,
  ADD COLUMN "customer_name" TEXT,
  ADD COLUMN "customer_phone" TEXT,
  ADD COLUMN "fulfillment_status" "TnFulfillmentStatus",
  ADD COLUMN "mp_cost_total" DECIMAL(14,2),
  ADD COLUMN "mp_fee_total" DECIMAL(14,2),
  ADD COLUMN "mp_payment_id" TEXT,
  ADD COLUMN "neto_mp_orden" DECIMAL(14,2),
  ADD COLUMN "payment_gateway" TEXT,
  ADD COLUMN "payment_method" TEXT,
  ADD COLUMN "province_localidad" TEXT,
  ADD COLUMN "shipping_option" TEXT,
  ADD COLUMN "shipping_owner" TEXT,
  ADD COLUMN "stock_deducted_at" TIMESTAMP(3);

CREATE INDEX "erp_orders_order_source_idx" ON "erp_orders"("order_source");
CREATE INDEX "payments_tn_order_id_idx" ON "payments"("tn_order_id");
CREATE INDEX "stock_movements_tn_order_id_idx" ON "stock_movements"("tn_order_id");
CREATE INDEX "tn_order_item_allocations_tn_order_id_idx" ON "tn_order_item_allocations"("tn_order_id");
CREATE UNIQUE INDEX "tn_order_item_allocations_tn_order_item_id_key" ON "tn_order_item_allocations"("tn_order_item_id");
CREATE INDEX "tn_orders_commercial_status_idx" ON "tn_orders"("commercial_status");
CREATE INDEX "tn_orders_channel_idx" ON "tn_orders"("channel");
CREATE INDEX "tn_orders_mp_payment_id_idx" ON "tn_orders"("mp_payment_id");

-- FKs: tn_order_item_allocations → tn_orders / tn_order_items
-- FKs: payments.tn_order_id → tn_orders
-- FKs: stock_movements.tn_order_id / tn_order_item_id → tn_orders / tn_order_items
