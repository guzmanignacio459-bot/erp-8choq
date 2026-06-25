-- M6.5.2 Transfer Fee — generated 2026-06-25T19:06:13.683Z
-- mode: incremental-idempotent

-- AlterTable
ALTER TABLE "financial_items" ADD COLUMN     "transfer_fee_allocated" DECIMAL(14,2) NOT NULL DEFAULT 0;
