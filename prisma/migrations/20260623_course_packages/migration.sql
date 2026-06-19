-- =============================================================
-- Migration: Pacotes de cursos (CoursePackage / CoursePackageItem / TenantPackage)
-- Data: 2026-06-23
-- Idempotente.
--
-- 1) Tabelas:
--    - course_packages       (pacote: PMB quando tenant_id NULL, ou da revenda)
--    - course_package_items  (cursos de cada pacote)
--    - tenant_packages       (override da revenda p/ um pacote: preço/visível/destaque)
--
-- 2) Colunas em enrollments:
--    - course_package_id  (FK -> course_packages, ON DELETE SET NULL)
--    - package_primary    (true = matrícula que carrega o Payment do pacote)
--
-- 3) Seção "packages" da home:
--    - PMB (tenant_id IS NULL): inserida logo após "Mais vendidos" (bestsellers)
--    - Backfill: tenants que já têm seções próprias ganham a linha "packages"
--      no fim. Tenants novos herdam via clone do PMB em ensureTenantHomeSections.
-- =============================================================

-- ---------- 1) Tabelas ----------
CREATE TABLE IF NOT EXISTS "course_packages" (
  "id"                TEXT PRIMARY KEY,
  "tenant_id"         TEXT,
  "name"              TEXT NOT NULL,
  "slug"              TEXT NOT NULL,
  "description"       TEXT,
  "cover_image_url"   TEXT,
  "price"             DECIMAL(10,2) NOT NULL,
  "featured"          BOOLEAN NOT NULL DEFAULT FALSE,
  "position"          INTEGER NOT NULL DEFAULT 0,
  "enabled"           BOOLEAN NOT NULL DEFAULT TRUE,
  "created_by_user_id" TEXT,
  "created_by_role"   "UserRole",
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "course_packages_tenant_id_slug_key"
  ON "course_packages" ("tenant_id", "slug");
CREATE INDEX IF NOT EXISTS "course_packages_tenant_id_enabled_idx"
  ON "course_packages" ("tenant_id", "enabled");

CREATE TABLE IF NOT EXISTS "course_package_items" (
  "id"         TEXT PRIMARY KEY,
  "package_id" TEXT NOT NULL,
  "course_id"  TEXT NOT NULL,
  "order"      INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "course_package_items_package_id_course_id_key"
  ON "course_package_items" ("package_id", "course_id");
CREATE INDEX IF NOT EXISTS "course_package_items_course_id_idx"
  ON "course_package_items" ("course_id");

CREATE TABLE IF NOT EXISTS "tenant_packages" (
  "id"               TEXT PRIMARY KEY,
  "tenant_id"        TEXT NOT NULL,
  "package_id"       TEXT NOT NULL,
  "price"            DECIMAL(10,2),
  "isVisible"        BOOLEAN NOT NULL DEFAULT TRUE,
  "is_featured"      BOOLEAN NOT NULL DEFAULT FALSE,
  "custom_order"     INTEGER NOT NULL DEFAULT 0,
  "custom_cover_url" TEXT,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "tenant_packages_tenant_id_package_id_key"
  ON "tenant_packages" ("tenant_id", "package_id");
CREATE INDEX IF NOT EXISTS "tenant_packages_tenant_id_isVisible_idx"
  ON "tenant_packages" ("tenant_id", "isVisible");

-- ---------- FKs (guardadas — ADD CONSTRAINT não tem IF NOT EXISTS) ----------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'course_packages_tenant_id_fkey') THEN
    ALTER TABLE "course_packages"
      ADD CONSTRAINT "course_packages_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'course_package_items_package_id_fkey') THEN
    ALTER TABLE "course_package_items"
      ADD CONSTRAINT "course_package_items_package_id_fkey"
      FOREIGN KEY ("package_id") REFERENCES "course_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'course_package_items_course_id_fkey') THEN
    ALTER TABLE "course_package_items"
      ADD CONSTRAINT "course_package_items_course_id_fkey"
      FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_packages_tenant_id_fkey') THEN
    ALTER TABLE "tenant_packages"
      ADD CONSTRAINT "tenant_packages_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_packages_package_id_fkey') THEN
    ALTER TABLE "tenant_packages"
      ADD CONSTRAINT "tenant_packages_package_id_fkey"
      FOREIGN KEY ("package_id") REFERENCES "course_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ---------- 2) Colunas em enrollments ----------
ALTER TABLE "enrollments" ADD COLUMN IF NOT EXISTS "course_package_id" TEXT;
ALTER TABLE "enrollments" ADD COLUMN IF NOT EXISTS "package_primary" BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS "enrollments_course_package_id_idx"
  ON "enrollments" ("course_package_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'enrollments_course_package_id_fkey') THEN
    ALTER TABLE "enrollments"
      ADD CONSTRAINT "enrollments_course_package_id_fkey"
      FOREIGN KEY ("course_package_id") REFERENCES "course_packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ---------- 3) Seção "packages" da home ----------
-- PMB: logo após "Mais vendidos" (bestsellers). Abre 1 posição e insere.
DO $$
DECLARE
  anchor_pos INTEGER;
BEGIN
  IF EXISTS (SELECT 1 FROM "home_sections" WHERE "id" = 'pmb-packages') THEN
    RETURN;
  END IF;

  SELECT "position" INTO anchor_pos
    FROM "home_sections" WHERE "tenant_id" IS NULL AND "kind" = 'bestsellers'
    ORDER BY "position" ASC LIMIT 1;
  IF anchor_pos IS NULL THEN
    SELECT COALESCE(MIN("position"), 0) - 1 INTO anchor_pos
      FROM "home_sections" WHERE "tenant_id" IS NULL;
  END IF;

  UPDATE "home_sections"
     SET "position" = "position" + 1, "updated_at" = NOW()
   WHERE "tenant_id" IS NULL AND "position" > anchor_pos;

  INSERT INTO "home_sections" ("id", "tenant_id", "kind", "position", "enabled", "config", "updated_at")
  VALUES (
    'pmb-packages',
    NULL,
    'packages',
    anchor_pos + 1,
    TRUE,
    jsonb_build_object(
      'kind', 'packages',
      'title', 'Pacotes de cursos',
      'subtitle', 'Leve vários cursos por um valor único'
    ),
    NOW()
  );
END $$;

-- Backfill dos tenants que já têm seções próprias (clonadas antes desta seção).
INSERT INTO "home_sections" ("id", "tenant_id", "kind", "position", "enabled", "config", "updated_at")
SELECT
  'packages-' || t."id",
  t."id",
  'packages',
  COALESCE((SELECT MAX(hs."position") + 1 FROM "home_sections" hs WHERE hs."tenant_id" = t."id"), 0),
  TRUE,
  jsonb_build_object(
    'kind', 'packages',
    'title', 'Pacotes de cursos',
    'subtitle', 'Leve vários cursos por um valor único'
  ),
  NOW()
FROM "tenants" t
WHERE EXISTS (SELECT 1 FROM "home_sections" hs2 WHERE hs2."tenant_id" = t."id")
  AND NOT EXISTS (SELECT 1 FROM "home_sections" hs3 WHERE hs3."tenant_id" = t."id" AND hs3."kind" = 'packages');
