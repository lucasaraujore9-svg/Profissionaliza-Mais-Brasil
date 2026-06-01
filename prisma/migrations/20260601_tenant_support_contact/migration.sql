-- Campos de contato do rodape exibidos na vitrine do revendedor.
-- Aditivos e nullable: nenhum impacto em linhas existentes.
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "support_email" TEXT;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "support_hours" TEXT;
