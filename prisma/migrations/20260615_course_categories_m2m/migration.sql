-- M2M curso <-> categoria.
-- Um curso pode pertencer a varias categorias. A tabela join inclui tambem a
-- categoria principal (courses.category_id) via backfill abaixo, de modo que
-- filtrar por join sempre encontra o curso.
-- Idempotente: seguro reaplicar (defesa do runner apply-pending-migrations).

CREATE TABLE IF NOT EXISTS "course_categories" (
  "course_id"   TEXT NOT NULL,
  "category_id" TEXT NOT NULL,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "course_categories_pkey" PRIMARY KEY ("course_id", "category_id")
);

CREATE INDEX IF NOT EXISTS "course_categories_category_id_idx"
  ON "course_categories" ("category_id");

DO $$ BEGIN
  ALTER TABLE "course_categories"
    ADD CONSTRAINT "course_categories_course_id_fkey"
    FOREIGN KEY ("course_id") REFERENCES "courses" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "course_categories"
    ADD CONSTRAINT "course_categories_category_id_fkey"
    FOREIGN KEY ("category_id") REFERENCES "categories" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Backfill: cada curso que ja tinha uma categoria principal vira uma linha no
-- join. ON CONFLICT garante idempotencia em reaplicacoes.
INSERT INTO "course_categories" ("course_id", "category_id")
SELECT "id", "category_id"
FROM "courses"
WHERE "category_id" IS NOT NULL
ON CONFLICT ("course_id", "category_id") DO NOTHING;
