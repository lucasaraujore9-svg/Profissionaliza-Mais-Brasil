-- =============================================================
-- Migration: Seed PMB com kinds categories_grid + institutional (Fase 2)
-- Data: 2026-05-28
-- Idempotente. Só insere blocos que ainda não existem (lookup por id estável).
-- Posiciona os novos blocos AO REDOR das seções de curso existentes:
--   0: institutional/trust_bar  (acima das seções de curso)
--   1: categories_grid          (acima das seções de curso)
--   2: bestsellers              (já existe — re-posiciona após este seed)
--   3..N: category_courses (já existem)
--   N+1: institutional/learn_anywhere (entre seções de curso e fechamento)
--   N+2: institutional/testimonials
--   N+3: institutional/final_cta
-- =============================================================

-- trust_bar
INSERT INTO "home_sections" ("id", "tenant_id", "kind", "position", "enabled", "config", "updated_at")
SELECT
  'pmb-trustbar', NULL, 'institutional', 0, TRUE,
  jsonb_build_object(
    'kind', 'institutional',
    'variant', 'trust_bar',
    'title', '',
    'subtitle', '',
    'body', '',
    'imageUrl', NULL,
    'buttonText', NULL,
    'buttonHref', NULL,
    'secondaryButtonText', NULL,
    'secondaryButtonHref', NULL,
    'items', jsonb_build_array(
      jsonb_build_object('title', 'Certificado incluso',  'body', 'Reconhecido em todo Brasil', 'iconName', 'Award',         'imageUrl', NULL, 'meta', NULL),
      jsonb_build_object('title', 'Pix, cartão ou boleto', 'body', 'Até 12x sem juros',          'iconName', 'Banknote',      'imageUrl', NULL, 'meta', NULL),
      jsonb_build_object('title', 'Estude pelo celular',   'body', 'No seu ritmo',               'iconName', 'Smartphone',    'imageUrl', NULL, 'meta', NULL),
      jsonb_build_object('title', '7 dias de garantia',    'body', 'Não gostou, devolvemos',     'iconName', 'ShieldCheck',   'imageUrl', NULL, 'meta', NULL),
      jsonb_build_object('title', 'Suporte no WhatsApp',   'body', 'Segunda a sábado',           'iconName', 'MessageCircle', 'imageUrl', NULL, 'meta', NULL)
    )
  ),
  NOW()
WHERE NOT EXISTS (SELECT 1 FROM "home_sections" WHERE "id" = 'pmb-trustbar');

-- categories_grid (Qual profissão você quer aprender?)
INSERT INTO "home_sections" ("id", "tenant_id", "kind", "position", "enabled", "config", "updated_at")
SELECT
  'pmb-categories-grid', NULL, 'categories_grid', 1, TRUE,
  jsonb_build_object(
    'kind', 'categories_grid',
    'title', 'Qual profissão você quer aprender?',
    'subtitle', 'Escolha uma área e veja os cursos disponíveis',
    'categoryIds', '[]'::jsonb
  ),
  NOW()
WHERE NOT EXISTS (SELECT 1 FROM "home_sections" WHERE "id" = 'pmb-categories-grid');

-- Reposiciona bestsellers e cat_* deslocados em +2 (já que inserimos 2 antes)
UPDATE "home_sections"
SET "position" = "position" + 2
WHERE "id" IN ('pmb-bestsellers', 'pmb-cat-informatica', 'pmb-cat-administrativo', 'pmb-cat-diversas')
  AND "position" < 4
  AND NOT EXISTS (
    -- Não reaplica se ja foi rodado uma vez (idempotencia)
    SELECT 1 FROM "_pmb_applied_migrations" WHERE "filename" = '20260528_home_sections_institutional'
  );

-- learn_anywhere (apos as secoes de curso)
INSERT INTO "home_sections" ("id", "tenant_id", "kind", "position", "enabled", "config", "updated_at")
SELECT
  'pmb-learn-anywhere', NULL, 'institutional', 6, TRUE,
  jsonb_build_object(
    'kind', 'institutional',
    'variant', 'learn_anywhere',
    'title', 'Sua escola no bolso',
    'subtitle', 'PROFISSIONALIZA',
    'body', 'Estude de qualquer lugar pelo celular, tablet ou computador. Aulas curtas, certificado ao final e acesso vitalício ao conteúdo.',
    'imageUrl', NULL,
    'buttonText', 'Conhecer os cursos',
    'buttonHref', '/cursos',
    'secondaryButtonText', NULL,
    'secondaryButtonHref', NULL,
    'items', jsonb_build_array(
      jsonb_build_object('title', 'Aulas curtas', 'body', 'Em média 8 minutos por aula', 'iconName', 'Clock',  'imageUrl', NULL, 'meta', NULL),
      jsonb_build_object('title', 'Acesso vitalício', 'body', 'Estude no seu tempo, sem prazo', 'iconName', 'Infinity', 'imageUrl', NULL, 'meta', NULL),
      jsonb_build_object('title', 'Certificado digital', 'body', 'Reconhecido em todo o Brasil', 'iconName', 'Award', 'imageUrl', NULL, 'meta', NULL)
    )
  ),
  NOW()
WHERE NOT EXISTS (SELECT 1 FROM "home_sections" WHERE "id" = 'pmb-learn-anywhere');

-- testimonials
INSERT INTO "home_sections" ("id", "tenant_id", "kind", "position", "enabled", "config", "updated_at")
SELECT
  'pmb-testimonials', NULL, 'institutional', 7, TRUE,
  jsonb_build_object(
    'kind', 'institutional',
    'variant', 'testimonials',
    'title', 'Gente como você que mudou de vida.',
    'subtitle', 'Histórias reais',
    'body', '',
    'imageUrl', NULL,
    'buttonText', NULL,
    'buttonHref', NULL,
    'secondaryButtonText', NULL,
    'secondaryButtonHref', NULL,
    'items', '[]'::jsonb
  ),
  NOW()
WHERE NOT EXISTS (SELECT 1 FROM "home_sections" WHERE "id" = 'pmb-testimonials');

-- final_cta
INSERT INTO "home_sections" ("id", "tenant_id", "kind", "position", "enabled", "config", "updated_at")
SELECT
  'pmb-final-cta', NULL, 'institutional', 8, TRUE,
  jsonb_build_object(
    'kind', 'institutional',
    'variant', 'final_cta',
    'title', 'Sua nova profissão está a um clique.',
    'subtitle', 'Comece hoje por R$ 47,00',
    'body', 'Escolhe o curso, paga no Pix com 10% de desconto e começa a estudar agora mesmo. Se não gostar nos primeiros 7 dias, devolvemos o seu dinheiro.',
    'imageUrl', NULL,
    'buttonText', 'Ver todos os cursos',
    'buttonHref', '/cursos',
    'secondaryButtonText', 'Como funciona',
    'secondaryButtonHref', '/como-funciona',
    'items', '[]'::jsonb
  ),
  NOW()
WHERE NOT EXISTS (SELECT 1 FROM "home_sections" WHERE "id" = 'pmb-final-cta');
