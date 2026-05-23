-- =============================================================
-- Migration: Visibilidade granular do curso nas revendas
-- Data: 2026-05-23
-- Idempotente.
--
-- Permite ao admin restringir a quais revendedores um curso aparece:
--   ALL       — todos os tenants ativos (default, comportamento atual)
--   ALLOWLIST — apenas os tenants em allowed_tenant_ids
--   DENYLIST  — todos exceto os tenants em blocked_tenant_ids
-- =============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CourseVisibility') THEN
    CREATE TYPE "CourseVisibility" AS ENUM ('ALL', 'ALLOWLIST', 'DENYLIST');
  END IF;
END $$;

ALTER TABLE "courses"
  ADD COLUMN IF NOT EXISTS "visibility_mode"    "CourseVisibility" NOT NULL DEFAULT 'ALL',
  ADD COLUMN IF NOT EXISTS "allowed_tenant_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "blocked_tenant_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Indice GIN para queries de pertencimento em allow/deny lists.
CREATE INDEX IF NOT EXISTS "courses_allowed_tenant_ids_idx"
  ON "courses" USING GIN ("allowed_tenant_ids");
CREATE INDEX IF NOT EXISTS "courses_blocked_tenant_ids_idx"
  ON "courses" USING GIN ("blocked_tenant_ids");
