-- =============================================================
-- Migration: "Cursos Técnicos" como HomeSection (kind="tecnica")
-- Data: 2026-06-08
-- Idempotente.
--
-- Antes, a seção "Cursos Técnicos" era renderizada numa posição fixa no rodapé
-- da home, fora do sistema de home_sections. Agora vira uma seção de verdade
-- (kind="tecnica") que participa de ordenação/ativação na aba "Seções da home".
--
-- O CONTEÚDO (cursos/imagens/URL/rótulo) continua em system_settings.tecnica_* —
-- a linha do home_sections é só marcador de posição + enabled. config = {kind}.
--
-- Seed:
--   - PMB (tenant_id IS NULL): cria a linha tecnica no fim, enabled espelhando
--     system_settings.tecnica_enabled.
--   - Tenants que já têm seções próprias: cria a linha tecnica no fim de cada um,
--     enabled espelhando tenants.tecnica_enabled. (Tenants novos herdam via clone
--     do PMB em ensureTenantHomeSections.)
-- =============================================================

-- PMB (tenant_id IS NULL) — só se ainda não existir.
INSERT INTO "home_sections" ("id", "tenant_id", "kind", "position", "enabled", "config", "updated_at")
SELECT
  'pmb-tecnica',
  NULL,
  'tecnica',
  COALESCE((SELECT MAX("position") + 1 FROM "home_sections" WHERE "tenant_id" IS NULL), 0),
  COALESCE((SELECT "tecnica_enabled" FROM "system_settings" WHERE "id" = 'default'), FALSE),
  jsonb_build_object('kind', 'tecnica'),
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM "home_sections" WHERE "tenant_id" IS NULL AND "kind" = 'tecnica'
);

-- Tenants que já possuem seções próprias mas ainda não têm a linha tecnica.
INSERT INTO "home_sections" ("id", "tenant_id", "kind", "position", "enabled", "config", "updated_at")
SELECT
  'tecnica-' || t."id",
  t."id",
  'tecnica',
  COALESCE((SELECT MAX(hs."position") + 1 FROM "home_sections" hs WHERE hs."tenant_id" = t."id"), 0),
  t."tecnica_enabled",
  jsonb_build_object('kind', 'tecnica'),
  NOW()
FROM "tenants" t
WHERE EXISTS (
    SELECT 1 FROM "home_sections" hs2 WHERE hs2."tenant_id" = t."id"
  )
  AND NOT EXISTS (
    SELECT 1 FROM "home_sections" hs3 WHERE hs3."tenant_id" = t."id" AND hs3."kind" = 'tecnica'
  );
