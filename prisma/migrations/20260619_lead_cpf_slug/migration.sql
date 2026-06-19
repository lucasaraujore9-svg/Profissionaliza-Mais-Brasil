-- =============================================================
-- Migration: CPF + slug desejado no lead de revenda
--
-- O formulario completo de captacao (/lp-revenda2) coleta, alem do nome/email/
-- telefone, o CPF do interessado e o subdominio (slug) que ele deseja para a
-- vitrine, alem do plano (209/239, ja persistido em `plan`). Persistimos CPF e
-- slug em colunas dedicadas para que aparecam nos dados do lead no admin.
--
-- Sao apenas INTENCAO capturada — a unicidade/reserva do slug e validada na
-- conversao em unidade, nao aqui.
--
-- Idempotente.
-- =============================================================

ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "cpf" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "slug" TEXT;
