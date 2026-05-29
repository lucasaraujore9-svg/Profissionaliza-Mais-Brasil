-- =============================================================
-- Migration: Tutorial guiado de primeiro acesso (onboarding tour)
-- Data: 2026-05-29
-- Idempotente.
-- - Marca quando o usuário (revendedor owner ou consultor) concluiu/pulou
--   o tour de primeiro acesso no painel. NULL = ainda não viu.
-- =============================================================

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "onboarding_tour_completed_at" TIMESTAMP(3);
