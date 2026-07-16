-- Layout por arte definido pelo designer (posicao/tamanho de logo e preco por
-- variante + fundos brancos opcionais). Null = defaults legados.
-- Idempotente (IF NOT EXISTS).

ALTER TABLE "marketing_arts" ADD COLUMN IF NOT EXISTS "layout" JSONB;
