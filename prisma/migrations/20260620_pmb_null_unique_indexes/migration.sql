-- DB-004: índices ÚNICOS PARCIAIS para o escopo PMB (tenant_id IS NULL).
--
-- No Postgres, dois NULLs são distintos num índice unique comum, então os
-- @@unique compostos ([tenant_id, code] etc.) NÃO deduplicam os registros da
-- vitrine PMB (tenant_id = NULL): (NULL,'PROMO20') pode entrar N vezes. O
-- mesmo vale para certificate_templates, onde tenant_id é @unique mas nullable
-- (vários templates PMB possíveis). Estes índices parciais fecham o buraco
-- garantindo unicidade por valor SÓ no escopo PMB — o escopo de cada tenant já
-- é coberto pelos @@unique compostos existentes.
--
-- IDEMPOTENTE e ADITIVO:
--   * Cada índice é criado via CREATE UNIQUE INDEX IF NOT EXISTS — seguro re-rodar.
--   * SEM CONCURRENTLY: o runner (scripts/apply-pending-migrations.mjs) aplica
--     cada migration dentro de uma transação, e CONCURRENTLY não roda em txn.
--   * NÃO-DESTRUTIVO: cada CREATE é envolto num DO/EXCEPTION que, se houver
--     duplicatas PMB pré-existentes (estado inconsistente raro), NÃO derruba o
--     deploy — emite RAISE WARNING acionável e segue. O índice entra
--     automaticamente assim que as duplicatas forem resolvidas e a migration
--     re-rodar (o tracking só marca como aplicada quando a transação fecha sem
--     erro fatal; o WARNING não aborta).

-- coupons(code) WHERE tenant_id IS NULL
DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS "coupons_pmb_code_key"
    ON "coupons"("code") WHERE "tenant_id" IS NULL;
EXCEPTION WHEN unique_violation THEN
  RAISE WARNING 'DB-004: cupons PMB (tenant_id IS NULL) com code duplicado — resolva e re-rode para criar coupons_pmb_code_key';
END $$;

-- course_packages(slug) WHERE tenant_id IS NULL
DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS "course_packages_pmb_slug_key"
    ON "course_packages"("slug") WHERE "tenant_id" IS NULL;
EXCEPTION WHEN unique_violation THEN
  RAISE WARNING 'DB-004: pacotes PMB (tenant_id IS NULL) com slug duplicado — resolva e re-rode para criar course_packages_pmb_slug_key';
END $$;

-- automation_message_templates(key) WHERE tenant_id IS NULL
DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS "automation_templates_pmb_key_key"
    ON "automation_message_templates"("key") WHERE "tenant_id" IS NULL;
EXCEPTION WHEN unique_violation THEN
  RAISE WARNING 'DB-004: templates de automação PMB (tenant_id IS NULL) com key duplicada — resolva e re-rode para criar automation_templates_pmb_key_key';
END $$;

-- certificate_templates: no máximo UM template PMB (tenant_id IS NULL).
-- Índice único numa expressão constante (true) sob o predicado parcial: só uma
-- linha pode satisfazer "tenant_id IS NULL".
DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS "certificate_templates_pmb_singleton_key"
    ON "certificate_templates"((true)) WHERE "tenant_id" IS NULL;
EXCEPTION WHEN unique_violation THEN
  RAISE WARNING 'DB-004: mais de um certificate_template PMB (tenant_id IS NULL) — resolva e re-rode para criar certificate_templates_pmb_singleton_key';
END $$;
