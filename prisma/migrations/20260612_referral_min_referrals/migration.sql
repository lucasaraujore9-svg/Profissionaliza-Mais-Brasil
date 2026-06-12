-- =============================================================
-- Migration: Minimo de indicacoes para receber comissao de recorrencia
-- Idempotente. Adiciona:
--   - system_settings.default_referral_min_referrals (Int, default 3)
--       minimo global de indicacoes ATIVAS para uma unidade comecar a
--       receber comissao de recorrencia.
--   - tenants.referral_min_referrals (Int, nullable)
--       override por unidade. NULL = usa o padrao global. 0 = sem minimo.
-- =============================================================

ALTER TABLE "system_settings"
  ADD COLUMN IF NOT EXISTS "default_referral_min_referrals" INTEGER NOT NULL DEFAULT 3;

ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "referral_min_referrals" INTEGER;
