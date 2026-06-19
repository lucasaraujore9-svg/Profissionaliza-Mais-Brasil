-- Integracao da nova fornecedora de cursos (LMS lms.bmbr.com.br).
-- Idempotente: aplicada automaticamente no build por scripts/apply-pending-migrations.mjs
-- e segura para re-execucao (IF NOT EXISTS / guardas DO $$).

-- Enum CourseProvider (CREATE TYPE nao tem IF NOT EXISTS — guardar com DO $$)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CourseProvider') THEN
    CREATE TYPE "CourseProvider" AS ENUM ('EA', 'LMS');
  END IF;
END $$;

-- courses: provider + identidade no LMS
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "provider" "CourseProvider" NOT NULL DEFAULT 'EA';
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "lms_course_id" TEXT;
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "lms_slug" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "courses_lms_course_id_key" ON "courses" ("lms_course_id");
CREATE INDEX IF NOT EXISTS "courses_provider_idx" ON "courses" ("provider");

-- Troca do unique de `nome` global pelo composto (provider, nome).
-- Cursos EA existentes ficam provider='EA' (default), entao o conjunto
-- (provider, nome) permanece unico — sem risco de violacao.
DROP INDEX IF EXISTS "courses_nome_key";
CREATE UNIQUE INDEX IF NOT EXISTS "courses_provider_nome_key" ON "courses" ("provider", "nome");

-- enrollments: id da matricula no LMS (para revoke)
ALTER TABLE "enrollments" ADD COLUMN IF NOT EXISTS "lms_enrollment_id" TEXT;
CREATE INDEX IF NOT EXISTS "enrollments_lms_enrollment_id_idx" ON "enrollments" ("lms_enrollment_id");

-- students: id no LMS (auditoria)
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "lms_student_id" TEXT;

-- system_settings: cursor do delta day-update
ALTER TABLE "system_settings" ADD COLUMN IF NOT EXISTS "lms_day_update_cursor" TEXT;
ALTER TABLE "system_settings" ADD COLUMN IF NOT EXISTS "lms_day_update_synced_at" TIMESTAMP(3);
