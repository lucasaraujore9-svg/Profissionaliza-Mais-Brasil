-- Personalizacao da identidade da unidade: logo para fundo escuro + ajuste fino
-- das cores (botoes, titulos, areas escuras, estrutura clara/escura).
-- Aditiva, idempotente, sem backfill: NULL = automatico, que reproduz o que a
-- loja ja mostrava a partir de primary_color/secondary_color.
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "logo_dark_url" TEXT;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "theme" JSONB;
