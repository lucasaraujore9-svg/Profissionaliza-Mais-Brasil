-- =============================================================
-- Migration: Perfil PMB_FINANCEIRO + comprovante de pagamento do saque
--
-- 1) Novo valor no enum UserRole: PMB_FINANCEIRO
-- 2) referral_payouts: colunas de comprovante (proof_url / proof_uploaded_at /
--    proof_uploaded_by_id) — anexado pelo Financeiro, visível para a revenda.
--
-- Idempotente.
-- =============================================================

-- 1) Enum value (ADD VALUE IF NOT EXISTS é idempotente; não pode rodar em
--    transação com outros comandos em Postgres, por isso fica isolado e antes
--    de qualquer uso). O apply-pending roda statements separadamente.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'PMB_FINANCEIRO';

-- 2) Comprovante do saque.
ALTER TABLE "referral_payouts" ADD COLUMN IF NOT EXISTS "proof_url" TEXT;
ALTER TABLE "referral_payouts" ADD COLUMN IF NOT EXISTS "proof_uploaded_at" TIMESTAMP(3);
ALTER TABLE "referral_payouts" ADD COLUMN IF NOT EXISTS "proof_uploaded_by_id" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'referral_payouts_proof_uploaded_by_id_fkey'
  ) THEN
    ALTER TABLE "referral_payouts"
      ADD CONSTRAINT "referral_payouts_proof_uploaded_by_id_fkey"
      FOREIGN KEY ("proof_uploaded_by_id") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
