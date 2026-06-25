-- M6.4 Financial Accounts — generated 2026-06-25T16:34:34.209Z
-- mode: incremental-idempotent

-- CreateTable
CREATE TABLE IF NOT EXISTS "financial_accounts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rate_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "financial_accounts_is_active_idx" ON "financial_accounts"("is_active");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "financial_accounts_is_default_idx" ON "financial_accounts"("is_default");
