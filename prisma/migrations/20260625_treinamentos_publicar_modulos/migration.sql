-- Treinamentos visíveis para TODAS as unidades (revendas).
--
-- Bug: o módulo nascia com published=false (o vídeo já nasce published=true),
-- e a vitrine do painel filtra `module.published = true`. Resultado: o admin
-- via tudo na gestão, mas as revendas viam a lista vazia.
--
-- Fix: módulo passa a nascer publicado (default da coluna) e os módulos legados
-- são publicados. Idempotente — pode reaplicar sem efeito colateral. O admin
-- ainda pode despublicar pontualmente pelo toggle de gestão.

ALTER TABLE "training_modules" ALTER COLUMN "published" SET DEFAULT true;

UPDATE "training_modules" SET "published" = true WHERE "published" = false;
