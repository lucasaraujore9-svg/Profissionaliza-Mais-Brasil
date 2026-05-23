-- =============================================================
-- Migration: Tabela `categories` + FK em `courses.category_id`
-- Data: 2026-05-23
-- Idempotente.
--
-- O sync da plataforma parceira continua preenchendo `courses.categoria_loja`
-- (raw). O admin cura uma lista curada em `categories` que aparece em todas
-- as superficies publicas (navbar, footer, filtros, vitrine). Backfill cria
-- 1 Category por valor distinto de `categoria_loja` e linka os cursos.
-- =============================================================

CREATE TABLE IF NOT EXISTS "categories" (
  "id"            TEXT PRIMARY KEY,
  "name"          TEXT NOT NULL,
  "slug"          TEXT NOT NULL,
  "display_order" INTEGER NOT NULL DEFAULT 0,
  "is_active"     BOOLEAN NOT NULL DEFAULT TRUE,
  "description"   TEXT,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "categories_name_key" ON "categories"("name");
CREATE UNIQUE INDEX IF NOT EXISTS "categories_slug_key" ON "categories"("slug");
CREATE INDEX IF NOT EXISTS "categories_isActive_displayOrder_idx" ON "categories"("is_active", "display_order");

-- FK opcional em courses
ALTER TABLE "courses"
  ADD COLUMN IF NOT EXISTS "category_id" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'courses_category_id_fkey'
  ) THEN
    ALTER TABLE "courses"
      ADD CONSTRAINT "courses_category_id_fkey"
      FOREIGN KEY ("category_id") REFERENCES "categories"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "courses_category_id_idx" ON "courses"("category_id");

-- ---------------------------------------------------------------
-- Backfill: cria 1 Category por categoria_loja distinta nao-null
-- e linka os cursos correspondentes.
-- Slug = normalizado lower-case kebab-case com mapeamentos manuais
-- para os nomes longos da plataforma parceira.
-- ---------------------------------------------------------------

INSERT INTO "categories" ("id", "name", "slug", "display_order", "is_active", "created_at", "updated_at")
SELECT
  'cat_' || md5(c.categoria_loja),
  -- Title Case basico: primeira letra de cada palavra em uppercase, conectores em minusculo
  INITCAP(LOWER(c.categoria_loja)) AS name,
  CASE LOWER(c.categoria_loja)
    WHEN 'informática e tecnologia' THEN 'informatica'
    WHEN 'diversas áreas'           THEN 'diversas'
    WHEN 'administrativo'           THEN 'administrativo'
    WHEN 'preparatórios'            THEN 'preparatorios'
    WHEN 'idiomas'                  THEN 'idiomas'
    -- Slug fallback: lower + remove acentos comuns + non-alnum -> hifen.
    -- `translate` cobre os diacriticos PT-BR mais frequentes sem exigir
    -- a extensao `unaccent`.
    ELSE trim(both '-' from regexp_replace(
      translate(
        lower(c.categoria_loja),
        'áàâãäéèêëíìîïóòôõöúùûüç',
        'aaaaaeeeeiiiiooooouuuuc'
      ),
      '[^a-z0-9]+', '-', 'g'
    ))
  END AS slug,
  0 AS display_order,
  TRUE AS is_active,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT categoria_loja
  FROM "courses"
  WHERE categoria_loja IS NOT NULL AND categoria_loja <> ''
) c
ON CONFLICT (name) DO NOTHING;

-- Linka cursos a Categorias correspondentes pelo nome (case-insensitive)
UPDATE "courses" co
SET "category_id" = ca.id
FROM "categories" ca
WHERE co.category_id IS NULL
  AND co.categoria_loja IS NOT NULL
  AND LOWER(ca.name) = LOWER(INITCAP(LOWER(co.categoria_loja)));
