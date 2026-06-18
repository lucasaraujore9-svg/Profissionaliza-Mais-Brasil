-- =============================================================
-- Migration: Normaliza a ordem das seções da home para a ordem canônica.
-- Data: 2026-06-20
-- Idempotente.
--
-- Ordem canônica pedida (seções que são HomeSection; Banner Principal e Rodapé
-- são renderizados fora do sistema de seções):
--    2  Benefícios            institutional/trust_bar
--    3  Mais vendidos         bestsellers
--    4  Informática e tec.    category_courses (categoria Informática)
--    5  Qual profissão        categories_grid
--    6  Administrativo        category_courses (categoria Administrativo)
--    7  Banner EJA            eja
--    8  Idiomas               idiomas
--    9  PROFISSIONALIZA       institutional/learn_anywhere ("Sua escola no bolso")
--   10  Diversas Áreas        category_courses (categoria Diversas)
--   11  Sua nova profissão    institutional/final_cta
--   12  Curso Técnico         tecnica
--   13  Depoimentos           institutional/testimonials
--
-- Contexto do bug:
--   A migration 20260617_eja_idiomas_home posicionou EJA/Idiomas corretamente só
--   no PMB. Para as UNIDADES que já tinham seções próprias, o backfill jogou EJA
--   e Idiomas no FIM da página, empilhadas — ao ligar o EJA o banner aparecia no
--   rodapé, "colado" na seção Idiomas. Além disso, a ordem da cauda (Diversas,
--   final_cta, Técnica, Depoimentos) não batia com a pedida.
--
-- O que faz:
--   1) PMB (tenant_id IS NULL): reordena SEMPRE para a ordem canônica — é o
--      template que as novas unidades clonam.
--   2) Unidades NO ESTADO BUGADO (EJA ou Idiomas posicionadas DEPOIS da âncora
--      "Sua escola no bolso"): reordena para a ordem canônica. Unidades que já
--      estão com EJA/Idiomas no lugar (ou que reordenaram intencionalmente) NÃO
--      são tocadas.
--
--   Em ambos os casos a renumeração é por uma "faixa" (rank) derivada da
--   assinatura de cada seção: category_courses casam por categoria (categoryId é
--   global, igual no PMB e nas unidades); institucionais por variant; o resto
--   por kind. Seções fora da ordem canônica (ex.: categorias extras criadas pela
--   unidade/admin) vão para o fim, preservando a ordem relativa entre si.
-- =============================================================

DO $$
DECLARE
  cat_inf   TEXT;
  cat_adm   TEXT;
  cat_div   TEXT;
  scope     RECORD;
  learn_pos INTEGER;
BEGIN
  -- categoryIds canônicos do PMB (Informática / Administrativo / Diversas).
  SELECT config->>'categoryId' INTO cat_inf FROM "home_sections" WHERE id = 'pmb-cat-informatica';
  SELECT config->>'categoryId' INTO cat_adm FROM "home_sections" WHERE id = 'pmb-cat-administrativo';
  SELECT config->>'categoryId' INTO cat_div FROM "home_sections" WHERE id = 'pmb-cat-diversas';

  -- ---------- 1) PMB: normaliza sempre ----------
  WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (
             ORDER BY
               CASE
                 WHEN kind = 'institutional'   AND config->>'variant' = 'trust_bar'     THEN 0
                 WHEN kind = 'bestsellers'                                               THEN 1
                 WHEN kind = 'category_courses' AND config->>'categoryId' = cat_inf      THEN 2
                 WHEN kind = 'categories_grid'                                           THEN 3
                 WHEN kind = 'category_courses' AND config->>'categoryId' = cat_adm      THEN 4
                 WHEN kind = 'eja'                                                       THEN 5
                 WHEN kind = 'idiomas'                                                   THEN 6
                 WHEN kind = 'institutional'   AND config->>'variant' = 'learn_anywhere' THEN 7
                 WHEN kind = 'category_courses' AND config->>'categoryId' = cat_div      THEN 8
                 WHEN kind = 'institutional'   AND config->>'variant' = 'final_cta'      THEN 9
                 WHEN kind = 'tecnica'                                                   THEN 10
                 WHEN kind = 'institutional'   AND config->>'variant' = 'testimonials'   THEN 11
                 ELSE 1000
               END,
               "position",
               created_at
           ) - 1 AS new_pos
      FROM "home_sections"
     WHERE tenant_id IS NULL
  )
  UPDATE "home_sections" hs
     SET "position" = ranked.new_pos,
         "updated_at" = NOW()
    FROM ranked
   WHERE hs.id = ranked.id
     AND hs."position" <> ranked.new_pos;

  -- ---------- 2) Unidades no estado bugado ----------
  FOR scope IN
    SELECT DISTINCT tenant_id AS tid
      FROM "home_sections"
     WHERE kind IN ('eja', 'idiomas')
       AND tenant_id IS NOT NULL
  LOOP
    -- Âncora: "Sua escola no bolso" (learn_anywhere).
    SELECT "position" INTO learn_pos
      FROM "home_sections"
     WHERE tenant_id IS NOT DISTINCT FROM scope.tid
       AND kind = 'institutional'
       AND config->>'variant' = 'learn_anywhere'
     ORDER BY "position" ASC
     LIMIT 1;

    -- Sem âncora confiável → não mexe.
    IF learn_pos IS NULL THEN
      CONTINUE;
    END IF;

    -- Só normaliza quando EJA/Idiomas estão DEPOIS da âncora (estado bugado).
    IF NOT EXISTS (
      SELECT 1 FROM "home_sections"
       WHERE tenant_id IS NOT DISTINCT FROM scope.tid
         AND kind IN ('eja', 'idiomas')
         AND "position" > learn_pos
    ) THEN
      CONTINUE;
    END IF;

    WITH ranked AS (
      SELECT id,
             ROW_NUMBER() OVER (
               ORDER BY
                 CASE
                   WHEN kind = 'institutional'   AND config->>'variant' = 'trust_bar'     THEN 0
                   WHEN kind = 'bestsellers'                                               THEN 1
                   WHEN kind = 'category_courses' AND config->>'categoryId' = cat_inf      THEN 2
                   WHEN kind = 'categories_grid'                                           THEN 3
                   WHEN kind = 'category_courses' AND config->>'categoryId' = cat_adm      THEN 4
                   WHEN kind = 'eja'                                                       THEN 5
                   WHEN kind = 'idiomas'                                                   THEN 6
                   WHEN kind = 'institutional'   AND config->>'variant' = 'learn_anywhere' THEN 7
                   WHEN kind = 'category_courses' AND config->>'categoryId' = cat_div      THEN 8
                   WHEN kind = 'institutional'   AND config->>'variant' = 'final_cta'      THEN 9
                   WHEN kind = 'tecnica'                                                   THEN 10
                   WHEN kind = 'institutional'   AND config->>'variant' = 'testimonials'   THEN 11
                   ELSE 1000
                 END,
                 "position",
                 created_at
             ) - 1 AS new_pos
        FROM "home_sections"
       WHERE tenant_id IS NOT DISTINCT FROM scope.tid
    )
    UPDATE "home_sections" hs
       SET "position" = ranked.new_pos,
           "updated_at" = NOW()
      FROM ranked
     WHERE hs.id = ranked.id
       AND hs."position" <> ranked.new_pos;
  END LOOP;
END $$;
