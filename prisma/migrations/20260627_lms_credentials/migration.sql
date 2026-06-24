-- Credenciais de acesso a plataforma do LMS (curso proprio do LMS ou parceiro)
-- por matricula. Vem em `partnerAccess` no 201 de POST /api/v1/enrollments.
-- Idempotente: aplicada automaticamente no build por scripts/apply-pending-migrations.mjs
-- e segura para re-execucao (ADD COLUMN IF NOT EXISTS).

ALTER TABLE "enrollments" ADD COLUMN IF NOT EXISTS "lms_origin" TEXT;
ALTER TABLE "enrollments" ADD COLUMN IF NOT EXISTS "lms_playback" TEXT;
ALTER TABLE "enrollments" ADD COLUMN IF NOT EXISTS "lms_login" TEXT;
ALTER TABLE "enrollments" ADD COLUMN IF NOT EXISTS "lms_senha" TEXT;
ALTER TABLE "enrollments" ADD COLUMN IF NOT EXISTS "lms_portal_url" TEXT;
