-- Favicon propria da vitrine da unidade.
--
-- Ate aqui o icone da aba do navegador (e o icone do PWA no manifest dinamico)
-- era SEMPRE derivado de `logo_url`. Logo de vitrine e favicon tem requisitos
-- diferentes: a logo costuma ser horizontal e some quando reduzida a 32x32, que
-- e o tamanho em que o navegador desenha o icone da aba. Agora a unidade pode
-- enviar um icone quadrado dedicado.
--
-- Idempotente. NAO faz backfill de proposito: `favicon_url` nasce NULL para
-- todo mundo e a leitura cai em `favicon_url ?? logo_url`, entao nenhuma vitrine
-- ja publicada muda de icone por causa desta migration.

ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "favicon_url" TEXT;
