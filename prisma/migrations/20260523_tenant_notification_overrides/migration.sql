-- =============================================================
-- Migration: Tabela `tenant_notification_overrides`
-- Data: 2026-05-23
-- Idempotente.
--
-- Permite que cada revenda desligue categorias automaticas que vao
-- para os alunos dela. Combinacao com o kill-switch global:
--   global enabled=FALSE              -> bloqueia para todos (mesmo se override ON)
--   global enabled=TRUE + override OFF -> bloqueia so para aquele tenant
--   global enabled=TRUE + sem override -> envia normalmente
--
-- Sempre se refere a categorias com target=STUDENT em
-- notification_category_configs (i.e. notificacoes que o aluno recebe).
-- =============================================================

CREATE TABLE IF NOT EXISTS "tenant_notification_overrides" (
  "tenant_id"   TEXT NOT NULL,
  "category"    TEXT NOT NULL,
  "enabled"     BOOLEAN NOT NULL DEFAULT TRUE,
  "updated_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("tenant_id", "category")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tenant_notification_overrides_tenant_id_fkey'
  ) THEN
    ALTER TABLE "tenant_notification_overrides"
      ADD CONSTRAINT "tenant_notification_overrides_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "tenant_notification_overrides_tenant_id_idx"
  ON "tenant_notification_overrides"("tenant_id");
