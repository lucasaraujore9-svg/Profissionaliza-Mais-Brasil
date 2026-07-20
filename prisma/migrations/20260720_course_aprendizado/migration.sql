-- Secao "O que voce vai aprender" editavel por curso.
--   courses.aprendizado              -> padrao global PMB (editado no catalogo mae)
--   tenant_courses.custom_aprendizado -> override exclusivo da vitrine da revenda
-- Ambos nascem vazios: cursos existentes seguem exibindo o texto generico
-- (APRENDIZADO_DEFAULT), ou seja, nenhuma pagina muda ate alguem editar.
--
-- Idempotente: aplicada automaticamente no build por
-- scripts/apply-pending-migrations.mjs e segura para re-execucao.

ALTER TABLE "courses"
  ADD COLUMN IF NOT EXISTS "aprendizado" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "tenant_courses"
  ADD COLUMN IF NOT EXISTS "custom_aprendizado" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
