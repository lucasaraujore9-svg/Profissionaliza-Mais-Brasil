-- =============================================================
-- Migration: Gestao financeira manual em TenantPayment e ReferralPayout
-- Data: 2026-05-22
-- Idempotente.
-- =============================================================

-- TenantPayment: notes + markedPaidAt + markedPaidBy
ALTER TABLE "tenant_payments"
  ADD COLUMN IF NOT EXISTS "notes"               TEXT,
  ADD COLUMN IF NOT EXISTS "marked_paid_at"      TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "marked_paid_by_id"   TEXT;

DO $$ BEGIN
  ALTER TABLE "tenant_payments"
    ADD CONSTRAINT "tenant_payments_marked_paid_by_id_fkey"
    FOREIGN KEY ("marked_paid_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "tenant_payments_marked_paid_by_idx"
  ON "tenant_payments"("marked_paid_by_id");

-- ReferralPayout: markedPaidBy (relacao com user; notes ja existia)
ALTER TABLE "referral_payouts"
  ADD COLUMN IF NOT EXISTS "marked_paid_by_id" TEXT;

DO $$ BEGIN
  ALTER TABLE "referral_payouts"
    ADD CONSTRAINT "referral_payouts_marked_paid_by_id_fkey"
    FOREIGN KEY ("marked_paid_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "referral_payouts_marked_paid_by_idx"
  ON "referral_payouts"("marked_paid_by_id");
