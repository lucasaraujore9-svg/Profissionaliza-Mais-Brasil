-- Trava de pagamento parcelado/mensalidade (PaymentType.MONTHLY) por unidade.
-- Dois niveis: monthly_allowed (Admin Master libera) + monthly_enabled (revendedor
-- usa); monthly_scope (Admin Master) define onde vale. Ver src/lib/tenant/monthly-policy.ts
--
-- Backfill: tenants EXISTENTES sao marcados como liberado+ativo+escopo total para
-- preservar exatamente o comportamento atual (qualquer revendedor podia vender
-- parcelado na vitrine). NOVOS tenants nascem travados pelos defaults das colunas.

-- Enum (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MonthlyScope') THEN
    CREATE TYPE "MonthlyScope" AS ENUM ('DIRECT_ONLY', 'DIRECT_AND_VITRINE');
  END IF;
END
$$;

-- Colunas (defaults travam novos tenants)
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "monthly_allowed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "monthly_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "monthly_scope" "MonthlyScope" NOT NULL DEFAULT 'DIRECT_ONLY';

-- Backfill dos tenants existentes (preserva comportamento atual)
UPDATE "tenants"
SET "monthly_allowed" = true,
    "monthly_enabled" = true,
    "monthly_scope" = 'DIRECT_AND_VITRINE';
