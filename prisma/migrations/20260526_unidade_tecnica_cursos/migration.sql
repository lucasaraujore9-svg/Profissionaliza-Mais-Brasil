-- =============================================================
-- Migration: Lista editavel de cursos da Unidade Tecnica
-- Data: 2026-05-26
-- Idempotente.
-- - Adiciona coluna JSON tecnica_courses em tenants e system_settings
-- - Seed do PMB: liga tecnica, URL padrao = escolatecnicadobrasil.com.br
--   e popula 4 cursos iniciais. So aplica se ainda nao estiverem definidos.
-- =============================================================

ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "tecnica_courses" JSONB;

ALTER TABLE "system_settings"
  ADD COLUMN IF NOT EXISTS "tecnica_courses" JSONB;

-- Seed do PMB (system_settings id='default') — so se ainda nao estiver setado.
-- Garante a row existente sem precisar de upsert no app. updated_at e NOT NULL
-- sem default no schema, precisa ser explicito no INSERT.
INSERT INTO "system_settings" ("id", "pmb_direct_sale_gateway", "updated_at")
VALUES ('default', 'MP', NOW())
ON CONFLICT ("id") DO NOTHING;

-- URL padrao: so seta se tecnica_url for NULL/vazio
UPDATE "system_settings"
SET
  "tecnica_url"     = COALESCE(NULLIF("tecnica_url", ''), 'https://escolatecnicadobrasil.com.br/'),
  "tecnica_enabled" = TRUE
WHERE "id" = 'default'
  AND (NULLIF("tecnica_url", '') IS NULL);

-- Seed dos 4 cursos default — so se tecnica_courses ainda for NULL
UPDATE "system_settings"
SET "tecnica_courses" = jsonb_build_array(
  jsonb_build_object('name', 'Técnico em Segurança do Trabalho',  'url', 'https://escolatecnicadobrasil.com.br/', 'order', 0),
  jsonb_build_object('name', 'Técnico em Administração',          'url', 'https://escolatecnicadobrasil.com.br/', 'order', 1),
  jsonb_build_object('name', 'Técnico em Estética',               'url', 'https://escolatecnicadobrasil.com.br/', 'order', 2),
  jsonb_build_object('name', 'Técnico em Transações Imobiliárias','url', 'https://escolatecnicadobrasil.com.br/', 'order', 3)
)
WHERE "id" = 'default'
  AND "tecnica_courses" IS NULL;
