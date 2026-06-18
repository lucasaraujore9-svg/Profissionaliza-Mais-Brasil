-- =============================================================
-- Migration: Backfill da sincronização EJA (HomeSection.enabled)
--
-- Contexto:
--   A fonte de verdade da renderização do banner EJA é o
--   `home_sections.enabled` (kind='eja'), NÃO o `tenants.eja_enabled`.
--   O formulário do admin gravava apenas `tenants.eja_*`, então unidades que
--   tiveram a linha home_sections criada com enabled=false (migration
--   20260617_eja_idiomas_home ou clone do PMB) nunca exibiam o banner mesmo
--   com EJA "ativado + URL" no admin.
--
--   A correção de código (setEjaSectionEnabled) passa a sincronizar daqui pra
--   frente. Este backfill corrige o estado já existente: liga a seção EJA das
--   unidades que JÁ têm EJA configurado de fato (eja_enabled=true + eja_url
--   preenchido) e cuja linha home_sections está enabled=false.
--
--   Espelha o mesmo para o PMB (tenant_id IS NULL) usando system_settings.
--
-- Idempotente: só atualiza linhas que precisam mudar.
-- =============================================================

-- Unidades: liga a seção EJA quando a unidade tem EJA configurado.
UPDATE "home_sections" hs
SET "enabled" = TRUE, "updated_at" = NOW()
FROM "tenants" t
WHERE hs."tenant_id" = t."id"
  AND hs."kind" = 'eja'
  AND hs."enabled" = FALSE
  AND t."eja_enabled" = TRUE
  AND NULLIF(TRIM(t."eja_url"), '') IS NOT NULL;

-- PMB (site institucional): espelha system_settings.eja_enabled.
UPDATE "home_sections" hs
SET "enabled" = COALESCE(
      (SELECT "eja_enabled" FROM "system_settings" WHERE "id" = 'default'),
      FALSE
    ),
    "updated_at" = NOW()
WHERE hs."tenant_id" IS NULL
  AND hs."kind" = 'eja'
  AND hs."enabled" IS DISTINCT FROM COALESCE(
      (SELECT "eja_enabled" FROM "system_settings" WHERE "id" = 'default'),
      FALSE
    );
