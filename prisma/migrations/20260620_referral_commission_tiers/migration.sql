-- =============================================================
-- Migration: Comissão escalonada por unidade indicada + activatedAt
--
-- 1) tenants.referral_tiers (JSONB)
--    Escala de % de comissão DESTA unidade (quando indicada), por meses de
--    calendário desde a ativação. Formato:
--      [{ "untilMonth": 6, "percent": 50 }, { "untilMonth": null, "percent": 20 }]
--    null/empty => sem escalonamento (cai no referral_percent / padrão global).
--
-- 2) tenants.activated_at (TIMESTAMP)
--    Base p/ contar os meses da escala. Backfill: 1ª mensalidade paga da
--    unidade; fallback created_at.
--
-- Idempotente.
-- =============================================================

ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "referral_tiers" JSONB;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "activated_at" TIMESTAMP(3);

-- Backfill activated_at = 1ª mensalidade paga; fallback created_at.
UPDATE "tenants" t
SET "activated_at" = COALESCE(
  (
    SELECT MIN(tp."paid_at")
    FROM "tenant_payments" tp
    WHERE tp."tenant_id" = t."id" AND tp."paid_at" IS NOT NULL
  ),
  t."created_at"
)
WHERE t."activated_at" IS NULL;
