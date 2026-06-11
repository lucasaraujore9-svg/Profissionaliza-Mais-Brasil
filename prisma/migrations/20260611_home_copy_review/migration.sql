-- =============================================================
-- Migration: Revisão de copy da home (review Madrid 2026-06-11)
-- Idempotente. Atualiza TODAS as seções (PMB tenant_id NULL + cópias
-- customizadas das unidades de revenda), conforme decisão do negócio.
--
-- 1) learn_anywhere ("Sua escola no bolso"):
--    - novo título/corpo
--    - bullets substituídos — o acesso NÃO é vitalício (é 12 meses)
-- 2) final_cta ("Sua nova profissão está a um clique."):
--    - remove o selo de preço ("Comece hoje por R$ 47,00")
--    - corpo novo em 3 parágrafos (separados por \n; o renderer divide)
-- =============================================================

-- learn_anywhere
UPDATE "home_sections"
SET
  "config" = "config" || jsonb_build_object(
    'title', 'O futuro da sua carreira começa hoje',
    'body', 'Estude pelo celular, tablet ou computador e conquiste uma nova profissão com certificado reconhecido em todo o Brasil.',
    'items', jsonb_build_array(
      jsonb_build_object('title', 'Quem confia recomenda', 'body', 'Mais de 100.000 alunos capacitados',          'iconName', 'Users',        'imageUrl', NULL, 'meta', NULL),
      jsonb_build_object('title', 'Certificado nacional',  'body', 'Certificado válido em todo Brasil',           'iconName', 'Award',        'imageUrl', NULL, 'meta', NULL),
      jsonb_build_object('title', 'Acesso por 12 meses',   'body', 'Estude no seu ritmo durante 1 ano completo',  'iconName', 'CalendarDays', 'imageUrl', NULL, 'meta', NULL)
    )
  ),
  "updated_at" = NOW()
WHERE "kind" = 'institutional'
  AND "config"->>'variant' = 'learn_anywhere';

-- final_cta
UPDATE "home_sections"
SET
  "config" = "config" || jsonb_build_object(
    'subtitle', '',
    'body', E'Escolha seu curso, a melhor forma de pagamento e dê o primeiro passo para transformar o seu futuro profissional.\nDesenvolva novas habilidades com os melhores cursos profissionalizantes do país, tenha acesso ao conteúdo por 12 meses e receba um certificado válido em todo o Brasil. Estude onde e quando quiser, no seu próprio ritmo.\nSem riscos para você: se não ficar satisfeito, devolvemos 100% do valor investido nos primeiros 7 dias.'
  ),
  "updated_at" = NOW()
WHERE "kind" = 'institutional'
  AND "config"->>'variant' = 'final_cta';
