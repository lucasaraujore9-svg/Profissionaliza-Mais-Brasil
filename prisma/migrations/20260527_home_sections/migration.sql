-- =============================================================
-- Migration: Home Sections — config dinamica da home (PMB + revenda)
-- Data: 2026-05-27
-- Idempotente.
-- - Cria a tabela home_sections
-- - Seed inicial para o PMB (tenant_id=NULL) replicando o layout atual:
--   bestsellers (random, 8) + 3 category_courses (informatica, administrativo, diversas)
-- =============================================================

CREATE TABLE IF NOT EXISTS "home_sections" (
  "id"         TEXT PRIMARY KEY,
  "tenant_id"  TEXT,
  "kind"       TEXT NOT NULL,
  "position"   INTEGER NOT NULL DEFAULT 0,
  "enabled"    BOOLEAN NOT NULL DEFAULT TRUE,
  "config"     JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "home_sections_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "home_sections_tenant_id_position_idx"
  ON "home_sections"("tenant_id", "position");

-- Seed do PMB (tenant_id IS NULL) — apenas se ainda nao existirem secoes.
DO $$
DECLARE
  has_sections BOOLEAN;
  cat_informatica TEXT;
  cat_administrativo TEXT;
  cat_diversas TEXT;
BEGIN
  SELECT EXISTS (SELECT 1 FROM "home_sections" WHERE "tenant_id" IS NULL) INTO has_sections;
  IF has_sections THEN
    RETURN;
  END IF;

  -- bestsellers (obrigatorio, primeira secao de cursos)
  INSERT INTO "home_sections" ("id", "tenant_id", "kind", "position", "enabled", "config", "updated_at")
  VALUES (
    'pmb-bestsellers',
    NULL,
    'bestsellers',
    0,
    TRUE,
    jsonb_build_object(
      'title', 'Os cursos mais vendidos da semana',
      'subtitle', 'O que o pessoal está comprando agora pra começar a faturar',
      'mode', 'random',
      'count', 8,
      'courseIds', '[]'::jsonb
    ),
    NOW()
  );

  -- Resolve category IDs por slug (silenciosamente pula o que nao existir)
  SELECT "id" INTO cat_informatica   FROM "categories" WHERE "slug" = 'informatica'   AND "is_active" = TRUE LIMIT 1;
  SELECT "id" INTO cat_administrativo FROM "categories" WHERE "slug" = 'administrativo' AND "is_active" = TRUE LIMIT 1;
  SELECT "id" INTO cat_diversas      FROM "categories" WHERE "slug" = 'diversas'      AND "is_active" = TRUE LIMIT 1;

  IF cat_informatica IS NOT NULL THEN
    INSERT INTO "home_sections" ("id", "tenant_id", "kind", "position", "enabled", "config", "updated_at")
    VALUES (
      'pmb-cat-informatica',
      NULL,
      'category_courses',
      1,
      TRUE,
      jsonb_build_object(
        'title', 'Informática e Tecnologia',
        'subtitle', 'Profissões em alta no mercado digital',
        'categoryId', cat_informatica,
        'mode', 'random',
        'count', 8,
        'courseIds', '[]'::jsonb,
        'showSeeMore', TRUE
      ),
      NOW()
    );
  END IF;

  IF cat_administrativo IS NOT NULL THEN
    INSERT INTO "home_sections" ("id", "tenant_id", "kind", "position", "enabled", "config", "updated_at")
    VALUES (
      'pmb-cat-administrativo',
      NULL,
      'category_courses',
      2,
      TRUE,
      jsonb_build_object(
        'title', 'Administrativo',
        'subtitle', 'Da rotina ao planejamento — capacite-se pra qualquer empresa',
        'categoryId', cat_administrativo,
        'mode', 'random',
        'count', 8,
        'courseIds', '[]'::jsonb,
        'showSeeMore', TRUE
      ),
      NOW()
    );
  END IF;

  IF cat_diversas IS NOT NULL THEN
    INSERT INTO "home_sections" ("id", "tenant_id", "kind", "position", "enabled", "config", "updated_at")
    VALUES (
      'pmb-cat-diversas',
      NULL,
      'category_courses',
      3,
      TRUE,
      jsonb_build_object(
        'title', 'Diversas áreas',
        'subtitle', 'Beleza, saúde, segurança do trabalho e muito mais',
        'categoryId', cat_diversas,
        'mode', 'random',
        'count', 8,
        'courseIds', '[]'::jsonb,
        'showSeeMore', TRUE
      ),
      NOW()
    );
  END IF;
END $$;
