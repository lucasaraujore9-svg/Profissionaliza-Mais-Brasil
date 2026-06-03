-- Mensalidade promocional do revendedor: as N primeiras mensalidades saem por uma
-- subscription "promo" (maxPayments=N, promo_value) e a regular (plan_value) assume
-- no mes N. Aditivos e nullable: nenhum impacto em linhas existentes.
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "asaas_promo_subscription_id" TEXT;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "promo_value" DECIMAL(10,2);
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "promo_months" INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS "tenants_asaas_promo_subscription_id_key"
  ON "tenants" ("asaas_promo_subscription_id");
