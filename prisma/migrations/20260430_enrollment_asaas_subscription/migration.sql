ALTER TABLE "enrollments"
  ADD COLUMN IF NOT EXISTS "asaas_subscription_id" TEXT,
  ADD COLUMN IF NOT EXISTS "installments_total" INTEGER,
  ADD COLUMN IF NOT EXISTS "installments_paid" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "enrollments_asaas_subscription_id_idx"
  ON "enrollments"("asaas_subscription_id");
