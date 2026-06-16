-- =============================================================
-- Migration: Seção "EJA" (banner + link por unidade) + seção "Idiomas"
-- Data: 2026-06-17
-- Idempotente.
--
-- 1) Colunas EJA:
--    - tenants.eja_enabled / eja_url / eja_label            (link por unidade)
--    - system_settings.eja_enabled / eja_url / eja_label    (link do site PMB)
--    - system_settings.eja_banner_image_url                 (banner padronizado)
--
-- 2) Seções da home do PMB (tenant_id IS NULL), na ordem pedida:
--      ... → [Administrativo] → [BANNER EJA] → [Idiomas] → [Sua escola no bolso.] → ...
--    - pmb-eja      (kind="eja")      logo APÓS "Administrativo" (pmb-cat-administrativo)
--    - pmb-idiomas  (kind="idiomas")  logo ANTES de "Sua escola no bolso" (pmb-learn-anywhere)
--    Abrimos um espaço de 2 posições após a âncora e inserimos as duas seções.
--    courseIds de Idiomas é populado best-effort com até 4 cursos cuja
--    categoria_loja começa com "idioma" (admin ajusta depois no painel).
--
-- 3) Backfill: tenants que já possuem seções próprias (clonadas antes destas
--    seções existirem) ganham as linhas eja + idiomas no fim. Tenants novos
--    herdam via clone do PMB em ensureTenantHomeSections.
--    (Para idiomas, o conteúdo/curso é sempre lido da seção idiomas do PMB —
--    a linha do tenant é só posição + enabled.)
-- =============================================================

-- ---------- 1) Colunas ----------
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "eja_enabled" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "eja_url"     TEXT;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "eja_label"   TEXT;

ALTER TABLE "system_settings" ADD COLUMN IF NOT EXISTS "eja_enabled"           BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "system_settings" ADD COLUMN IF NOT EXISTS "eja_url"               TEXT;
ALTER TABLE "system_settings" ADD COLUMN IF NOT EXISTS "eja_label"             TEXT;
ALTER TABLE "system_settings" ADD COLUMN IF NOT EXISTS "eja_banner_image_url"  TEXT;

-- ---------- 2) Seções do PMB ----------
DO $$
DECLARE
  anchor_pos      INTEGER;
  idiomas_courses JSONB;
BEGIN
  -- Já aplicado? (idempotência manual — o runner já evita re-execução).
  IF EXISTS (SELECT 1 FROM "home_sections" WHERE "id" = 'pmb-eja') THEN
    RETURN;
  END IF;

  -- Âncora: posição de "Administrativo". Fallbacks: logo antes de "Sua escola
  -- no bolso"; senão, fim da lista.
  SELECT "position" INTO anchor_pos
    FROM "home_sections" WHERE "id" = 'pmb-cat-administrativo' AND "tenant_id" IS NULL;
  IF anchor_pos IS NULL THEN
    SELECT "position" - 1 INTO anchor_pos
      FROM "home_sections" WHERE "id" = 'pmb-learn-anywhere' AND "tenant_id" IS NULL;
  END IF;
  IF anchor_pos IS NULL THEN
    SELECT COALESCE(MAX("position"), -1) INTO anchor_pos
      FROM "home_sections" WHERE "tenant_id" IS NULL;
  END IF;

  -- Abre 2 posições logo após a âncora.
  UPDATE "home_sections"
     SET "position" = "position" + 2, "updated_at" = NOW()
   WHERE "tenant_id" IS NULL AND "position" > anchor_pos;

  -- 4 cursos de Idiomas (best-effort por categoria_loja). Só popula quando há
  -- pelo menos 4 cursos de idiomas ativos (a seção exige exatamente 4); caso
  -- contrário deixa vazio (a seção não renderiza) e o admin seleciona depois no
  -- painel. ORDER BY dentro do agg garante ordem determinística do array.
  SELECT COALESCE(jsonb_agg(to_jsonb(c."id") ORDER BY c."nome"), '[]'::jsonb)
    INTO idiomas_courses
  FROM (
    SELECT "id", "nome" FROM "courses"
     WHERE "status" = 'ATIVO' AND "hidden_main" = FALSE AND "categoria_loja" ILIKE 'idioma%'
     ORDER BY "nome"
     LIMIT 4
  ) c;
  IF jsonb_array_length(idiomas_courses) <> 4 THEN
    idiomas_courses := '[]'::jsonb;
  END IF;

  -- Banner EJA — logo após "Administrativo". enabled espelha system_settings.eja_enabled.
  INSERT INTO "home_sections" ("id", "tenant_id", "kind", "position", "enabled", "config", "updated_at")
  VALUES (
    'pmb-eja',
    NULL,
    'eja',
    anchor_pos + 1,
    COALESCE((SELECT "eja_enabled" FROM "system_settings" WHERE "id" = 'default'), FALSE),
    jsonb_build_object('kind', 'eja'),
    NOW()
  );

  -- Idiomas — logo após o banner, antes de "Sua escola no bolso".
  INSERT INTO "home_sections" ("id", "tenant_id", "kind", "position", "enabled", "config", "updated_at")
  VALUES (
    'pmb-idiomas',
    NULL,
    'idiomas',
    anchor_pos + 2,
    TRUE,
    jsonb_build_object(
      'kind', 'idiomas',
      'title', 'Idiomas',
      'subtitle', 'Aprenda um novo idioma e abra portas no mercado de trabalho',
      'courseIds', idiomas_courses
    ),
    NOW()
  );
END $$;

-- ---------- 3) Backfill dos tenants com seções próprias ----------
-- Banner EJA (enabled espelha tenants.eja_enabled).
INSERT INTO "home_sections" ("id", "tenant_id", "kind", "position", "enabled", "config", "updated_at")
SELECT
  'eja-' || t."id",
  t."id",
  'eja',
  COALESCE((SELECT MAX(hs."position") + 1 FROM "home_sections" hs WHERE hs."tenant_id" = t."id"), 0),
  t."eja_enabled",
  jsonb_build_object('kind', 'eja'),
  NOW()
FROM "tenants" t
WHERE EXISTS (SELECT 1 FROM "home_sections" hs2 WHERE hs2."tenant_id" = t."id")
  AND NOT EXISTS (SELECT 1 FROM "home_sections" hs3 WHERE hs3."tenant_id" = t."id" AND hs3."kind" = 'eja');

-- Idiomas (conteúdo lido do PMB no render; aqui é só posição + enabled).
INSERT INTO "home_sections" ("id", "tenant_id", "kind", "position", "enabled", "config", "updated_at")
SELECT
  'idiomas-' || t."id",
  t."id",
  'idiomas',
  COALESCE((SELECT MAX(hs."position") + 1 FROM "home_sections" hs WHERE hs."tenant_id" = t."id"), 0),
  TRUE,
  jsonb_build_object('kind', 'idiomas', 'title', 'Idiomas', 'subtitle', '', 'courseIds', '[]'::jsonb),
  NOW()
FROM "tenants" t
WHERE EXISTS (SELECT 1 FROM "home_sections" hs2 WHERE hs2."tenant_id" = t."id")
  AND NOT EXISTS (SELECT 1 FROM "home_sections" hs3 WHERE hs3."tenant_id" = t."id" AND hs3."kind" = 'idiomas');
