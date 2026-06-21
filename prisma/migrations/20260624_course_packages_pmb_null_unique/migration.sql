-- DB-004 (follow-up): índice ÚNICO PARCIAL de course_packages para o escopo PMB.
--
-- Originalmente este índice estava em 20260620_pmb_null_unique_indexes, mas a
-- tabela course_packages só é criada em 20260623_course_packages — que ordena
-- DEPOIS daquela migration. Numa base do zero (dev fresh, prisma migrate reset,
-- cutover self-host/VPS) a tabela ainda não existia ao aplicar a 20260620, e o
-- CREATE INDEX falhava com undefined_table (42P01) — NÃO capturado pelo handler
-- de unique_violation (23505), abortando a transação e o deploy inteiro.
--
-- Movido para esta migration, que ordena ESTRITAMENTE DEPOIS de
-- 20260623_course_packages — então a tabela já existe quando este índice roda.
--
-- Por que o índice parcial: no Postgres dois NULLs são distintos num unique
-- comum, então o @@unique composto (tenant_id, slug) NÃO deduplica os pacotes da
-- vitrine PMB (tenant_id = NULL): (NULL,'combo-x') poderia entrar N vezes. Este
-- índice parcial garante unicidade de slug SÓ no escopo PMB; o escopo de cada
-- tenant já é coberto pelo @@unique composto existente.
--
-- IDEMPOTENTE e ADITIVO:
--   * CREATE UNIQUE INDEX IF NOT EXISTS — seguro re-rodar.
--   * SEM CONCURRENTLY: o runner aplica cada migration numa transação, e
--     CONCURRENTLY não roda em txn.
--   * Guarda defensiva belt-and-suspenders: só cria se a tabela existir
--     (to_regclass NOT NULL). Com a ordenação correta a tabela já existe; a
--     guarda evita o 42P01 em qualquer cenário de aplicação fora de ordem.
--   * NÃO-DESTRUTIVO: o CREATE é envolto num DO/EXCEPTION que, se houver
--     duplicatas PMB pré-existentes, NÃO derruba o deploy — emite RAISE WARNING.
--
-- ATENÇÃO: uma migration marcada como aplicada NUNCA re-roda. Se o WARNING de
-- unique_violation disparar, o índice fica POR CRIAR e exige intervenção manual
-- (resolver duplicatas e criar à mão / via nova migration).

-- course_packages(slug) WHERE tenant_id IS NULL
DO $$
BEGIN
  IF to_regclass('public.course_packages') IS NOT NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS "course_packages_pmb_slug_key"
      ON "course_packages"("slug") WHERE "tenant_id" IS NULL;
  END IF;
EXCEPTION WHEN unique_violation THEN
  RAISE WARNING 'DB-004: pacotes PMB (tenant_id IS NULL) com slug duplicado — resolva e crie course_packages_pmb_slug_key manualmente';
END $$;
