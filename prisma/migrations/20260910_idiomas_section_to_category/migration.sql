-- =============================================================
-- Migration: "Idiomas" deixa de ser seção fixa e vira seção de categoria comum.
-- Data: 2026-09-10
-- Idempotente.
--
-- Antes: kind='idiomas' era uma lista ÚNICA de 4 cursos escolhida pela PMB. A
-- vitrine de cada unidade lia os courseIds da linha da PMB no render, e o
-- servidor descartava qualquer edição vinda da unidade. Quando um dos 4
-- (ea_76, "Inglês do Zero a Fluência") foi DESCONTINUADO na fornecedora, a
-- seção passou a mostrar 3 cursos na rede inteira — com 8 cursos de idiomas
-- ativos no catálogo e nenhuma unidade podendo trocar.
--
-- Depois (decisão do dono): Idiomas é uma seção como qualquer outra —
-- kind='category_courses' apontando para a categoria "Idiomas", no mesmo padrão
-- das seções canônicas da PMB (aleatório, 8 cursos, "ver todos"). Cada unidade
-- edita título, subtítulo, modo, quantidade e cursos na própria vitrine.
--
-- O que faz, por escopo (PMB e cada unidade):
--   - Converte a linha kind='idiomas' NO LUGAR: mesmo id (a PMB segue com
--     'pmb-idiomas', que o código usa para achar a categoria na ordem
--     canônica), mesma posição e mesmo enabled.
--   - Título preservado. Subtítulo vazio herda o da PMB: a unidade nunca pôde
--     editá-lo, então o vazio não foi escolha dela.
--   - Escopo que JÁ tivesse seção de categoria para Idiomas perde a linha fixa
--     em vez de ganhar uma duplicata (não havia nenhum em 10/09; é guarda).
--   Sem a categoria 'idiomas' (banco local vazio), não faz nada.
-- =============================================================

WITH cat AS (
  SELECT "id" FROM "categories" WHERE "slug" = 'idiomas' LIMIT 1
),
pmb AS (
  SELECT NULLIF("config"->>'subtitle', '') AS subtitle
  FROM "home_sections"
  WHERE "tenant_id" IS NULL AND "kind" = 'idiomas'
  ORDER BY "position"
  LIMIT 1
)
UPDATE "home_sections" hs
SET "kind" = 'category_courses',
    "config" = jsonb_build_object(
      'kind', 'category_courses',
      'title', COALESCE(NULLIF(hs."config"->>'title', ''), 'Idiomas'),
      'subtitle', COALESCE(NULLIF(hs."config"->>'subtitle', ''), (SELECT subtitle FROM pmb), ''),
      'categoryId', cat."id",
      'mode', 'random',
      'count', 8,
      'courseIds', '[]'::jsonb,
      'showSeeMore', TRUE
    ),
    "updated_at" = NOW()
FROM cat
WHERE hs."kind" = 'idiomas'
  AND NOT EXISTS (
    SELECT 1 FROM "home_sections" x
    WHERE x."kind" = 'category_courses'
      AND x."tenant_id" IS NOT DISTINCT FROM hs."tenant_id"
      AND x."config"->>'categoryId' = cat."id"
  );

DELETE FROM "home_sections" hs
USING "categories" cat
WHERE hs."kind" = 'idiomas'
  AND cat."slug" = 'idiomas'
  AND EXISTS (
    SELECT 1 FROM "home_sections" x
    WHERE x."kind" = 'category_courses'
      AND x."tenant_id" IS NOT DISTINCT FROM hs."tenant_id"
      AND x."config"->>'categoryId' = cat."id"
  );
