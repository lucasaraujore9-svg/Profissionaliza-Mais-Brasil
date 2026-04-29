-- Adiciona overrides admin (parcelas) e tenant-level (capa, parcelas)
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "parcelas_override" INTEGER;
ALTER TABLE "tenant_courses" ADD COLUMN IF NOT EXISTS "custom_capa_url" TEXT;
ALTER TABLE "tenant_courses" ADD COLUMN IF NOT EXISTS "custom_parcelas" INTEGER;
