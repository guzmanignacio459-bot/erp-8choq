-- M6.5.1 Financial Account Assignments — generated 2026-06-25T16:58:08.911Z
-- mode: incremental-idempotent

-- CreateEnum
DO $mig$ BEGIN
  CREATE TYPE "FinancialAssignmentOriginType" AS ENUM ('TN_ORDER', 'REMITO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

-- CreateEnum
DO $mig$ BEGIN
  CREATE TYPE "FinancialAssignmentSource" AS ENUM ('MANUAL', 'PERIOD', 'DEFAULT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "financial_account_assignments" (
    "id" TEXT NOT NULL,
    "origin_type" "FinancialAssignmentOriginType" NOT NULL,
    "origin_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "assignment_source" "FinancialAssignmentSource" NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL,
    "rate_percent_snapshot" DECIMAL(5,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_account_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "financial_account_periods" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "effective_to" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_account_periods_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "financial_account_assignments_account_id_idx" ON "financial_account_assignments"("account_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "financial_account_assignments_assigned_at_idx" ON "financial_account_assignments"("assigned_at");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "financial_account_assignments_origin_type_origin_id_key" ON "financial_account_assignments"("origin_type", "origin_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "financial_account_periods_account_id_idx" ON "financial_account_periods"("account_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "financial_account_periods_effective_from_effective_to_idx" ON "financial_account_periods"("effective_from", "effective_to");

-- AddForeignKey
DO $mig$ BEGIN
  ALTER TABLE "financial_account_assignments" ADD CONSTRAINT "financial_account_assignments_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "financial_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

-- AddForeignKey
DO $mig$ BEGIN
  ALTER TABLE "financial_account_periods" ADD CONSTRAINT "financial_account_periods_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "financial_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;
