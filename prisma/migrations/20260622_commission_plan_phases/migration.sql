-- =============================================================
-- Migration: Plano de comissao MULTI-FASE + override por revendedor + congelamento
--
-- Estende o motor por faixas (MONTHLY_TIERED) com:
--   1) Plano multi-fase: uma regra de comissao que muda ao longo do tempo do
--      indicador no programa (ex.: 1os 3 meses valor fixo, depois percentual).
--      Armazenado como JSON em system_settings.commission_plan (padrao global)
--      e tenants.commission_plan (override por unidade).
--   2) Ancora do relogio de fases por unidade (tenants.commission_plan_started_at;
--      null => usa created_at).
--   3) Origem do override (tenants.commission_override_source): MANUAL (admin
--      editou) ou FROZEN (congelado ao salvar a global com escopo "apenas novas").
--
-- Tudo aditivo e nullable — nenhum dado existente muda de comportamento
-- (commission_plan vazio => motor cai nas faixas singulares ja existentes).
-- Idempotente (roda como 1 transacao no apply-pending).
-- =============================================================

-- 1) Plano multi-fase global (system_settings).
ALTER TABLE "system_settings"
  ADD COLUMN IF NOT EXISTS "commission_plan" JSONB;

-- 2) Override multi-fase + ancora + origem por unidade (tenants).
ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "commission_plan" JSONB;

ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "commission_plan_started_at" TIMESTAMP(3);

ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "commission_override_source" TEXT;

-- 3) Backfill da origem do override para unidades que JA tinham um override
--    singular antes desta migration (commission_mode != NULL ou faixas proprias).
--    Sao marcadas como MANUAL para que um futuro "aplicar a todas" nao as limpe
--    (preservando a intencao explicita do admin pre-existente).
UPDATE "tenants"
SET "commission_override_source" = 'MANUAL'
WHERE "commission_override_source" IS NULL
  AND (
    "commission_mode" IS NOT NULL
    OR "commission_bracket_basis" IS NOT NULL
    OR "commission_rate_type" IS NOT NULL
    OR "commission_payout_base" IS NOT NULL
    OR "commission_brackets" IS NOT NULL
  );
