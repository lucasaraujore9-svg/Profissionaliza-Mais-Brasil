-- =============================================================
-- Migration: tours guiados dispensados por usuário/aluno
-- Data: 2026-06-30
-- Idempotente (ADD COLUMN IF NOT EXISTS).
--
-- Suporte ao novo framework de tutoriais por página/função (driver.js).
-- Antes existia só um booleano (users.onboarding_tour_completed_at) que
-- cobria apenas o tour de visão geral. Agora cada página/função tem um tour
-- com id estável; o id entra no array quando o tour é fechado, para não
-- auto-reabrir nos próximos acessos.
--
-- Mapeia User.dismissedTours / Student.dismissedTours (String[] @default([])).
-- text[] NOT NULL com default array vazio, casando com o client do Prisma.
--
-- onboarding_tour_completed_at é mantido (legado) — quando preenchido, a
-- aplicação semeia "painel.overview" como dispensado em runtime.
-- =============================================================

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "dismissed_tours" TEXT[] NOT NULL DEFAULT ARRAY[]::text[];

ALTER TABLE "students"
  ADD COLUMN IF NOT EXISTS "dismissed_tours" TEXT[] NOT NULL DEFAULT ARRAY[]::text[];
