-- =============================================================
-- Migration: Parcelamento da primeira mensalidade do revendedor
-- Idempotente. Adiciona:
--   - tenants.first_payment_max_installments (Int, default 1)
--       teto de parcelas no cartao para a 1a mensalidade. 1 = a vista.
--       O revendedor escolhe de 1x ate este valor no checkout /cobranca.
-- =============================================================

ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "first_payment_max_installments" INTEGER NOT NULL DEFAULT 1;
