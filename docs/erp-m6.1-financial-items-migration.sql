-- M6.1 Financial Items — generated 2026-06-23T19:11:38.464Z
-- mode: incremental-idempotent

-- CreateEnum
DO $mig$ BEGIN
  CREATE TYPE "FinancialItemOriginType" AS ENUM ('TN_ORDER', 'REMITO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "financial_items" (
    "id" TEXT NOT NULL,
    "origin_type" "FinancialItemOriginType" NOT NULL,
    "origin_id" TEXT NOT NULL,
    "origin_item_id" TEXT NOT NULL,
    "unit_key" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "customer_name" TEXT,
    "sku" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "variant_name" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "gross_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discount_allocated" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tn_fee_allocated" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "mp_fee_allocated" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "shipping_allocated" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "meta_ads_allocated" DECIMAL(14,2),
    "net_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "payment_method" TEXT,
    "status" TEXT NOT NULL,
    "source_created_at" TIMESTAMP(3),
    "generator_version" TEXT NOT NULL DEFAULT 'm6.1-tn-v1',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "financial_items_date_idx" ON "financial_items"("date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "financial_items_sku_idx" ON "financial_items"("sku");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "financial_items_status_idx" ON "financial_items"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "financial_items_origin_id_idx" ON "financial_items"("origin_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "financial_items_origin_type_unit_key_key" ON "financial_items"("origin_type", "unit_key");
