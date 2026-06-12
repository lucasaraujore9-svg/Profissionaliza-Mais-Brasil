-- =============================================================
-- Migration: Distribuicao automatica de leads (rodizio entre consultores)
-- Idempotente. Adiciona em `tenants`:
--   - lead_auto_assign  (liga/desliga o rodizio automatico)
--   - lead_assign_cursor (ponteiro round-robin, incrementado por atribuicao)
-- O campo owner_user_id em student_leads ja existia no schema; aqui so
-- garantimos as colunas de configuracao do tenant.
-- =============================================================

ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "lead_auto_assign" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "lead_assign_cursor" INTEGER NOT NULL DEFAULT 0;
