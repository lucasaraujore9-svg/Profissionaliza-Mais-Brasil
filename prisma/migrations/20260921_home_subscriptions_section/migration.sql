-- Seção "subscriptions" (Assinaturas) na home — espelha a de "packages"
-- (20260623_course_packages). Sem schema novo: só as linhas de home_sections,
-- para que a prateleira exista sem ninguém precisar abrir o editor da vitrine.
--
-- enabled = TRUE em todo escopo: a seção só RENDERIZA quando resolveVitrinePlans
-- devolve plano, e unidade sem o módulo "Vender assinaturas" nunca tem nenhum.
-- Idempotente (guarda por id/NOT EXISTS), sem backfill de dados.

-- ---------- PMB: logo após "Pacotes" (ou "Mais vendidos"). ----------
DO $$
DECLARE
  anchor_pos INTEGER;
BEGIN
  IF EXISTS (SELECT 1 FROM "home_sections" WHERE "id" = 'pmb-subscriptions') THEN
    RETURN;
  END IF;

  SELECT "position" INTO anchor_pos
    FROM "home_sections" WHERE "tenant_id" IS NULL AND "kind" = 'packages'
    ORDER BY "position" ASC LIMIT 1;
  IF anchor_pos IS NULL THEN
    SELECT "position" INTO anchor_pos
      FROM "home_sections" WHERE "tenant_id" IS NULL AND "kind" = 'bestsellers'
      ORDER BY "position" ASC LIMIT 1;
  END IF;
  IF anchor_pos IS NULL THEN
    SELECT COALESCE(MIN("position"), 0) - 1 INTO anchor_pos
      FROM "home_sections" WHERE "tenant_id" IS NULL;
  END IF;

  UPDATE "home_sections"
     SET "position" = "position" + 1, "updated_at" = NOW()
   WHERE "tenant_id" IS NULL AND "position" > anchor_pos;

  INSERT INTO "home_sections" ("id", "tenant_id", "kind", "position", "enabled", "config", "updated_at")
  VALUES (
    'pmb-subscriptions',
    NULL,
    'subscriptions',
    anchor_pos + 1,
    TRUE,
    jsonb_build_object(
      'kind', 'subscriptions',
      'title', 'Assinaturas',
      'subtitle', 'Estude vários cursos com um único plano'
    ),
    NOW()
  );
END $$;

-- ---------- Unidades que já têm seções próprias (clonadas antes desta). ----------
-- Vai para o fim da lista da unidade; a ordem canônica em código
-- (reorderScopeToCanonical) a reposiciona quando o escopo for normalizado.
INSERT INTO "home_sections" ("id", "tenant_id", "kind", "position", "enabled", "config", "updated_at")
SELECT
  'subscriptions-' || t."id",
  t."id",
  'subscriptions',
  COALESCE((SELECT MAX(hs."position") + 1 FROM "home_sections" hs WHERE hs."tenant_id" = t."id"), 0),
  TRUE,
  jsonb_build_object(
    'kind', 'subscriptions',
    'title', 'Assinaturas',
    'subtitle', 'Estude vários cursos com um único plano'
  ),
  NOW()
FROM "tenants" t
WHERE EXISTS (SELECT 1 FROM "home_sections" hs2 WHERE hs2."tenant_id" = t."id")
  AND NOT EXISTS (SELECT 1 FROM "home_sections" hs3 WHERE hs3."tenant_id" = t."id" AND hs3."kind" = 'subscriptions');

-- ---------- Reposiciona a linha da unidade para logo APÓS "packages". ----------
-- O INSERT acima a coloca no fim da lista (MAX+1), onde ela apareceria abaixo
-- dos depoimentos. Roda em passo separado para ser idempotente: escopo já no
-- lugar (ou com arranjo diferente do conhecido) é pulado — fail-closed.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT h.id AS sub_id,
           h.tenant_id,
           h.position AS pos_sub,
           (SELECT p.position FROM home_sections p
             WHERE p.tenant_id = h.tenant_id AND p.kind = 'packages'
             ORDER BY p.position ASC LIMIT 1) AS pos_pkg,
           (SELECT max(m.position) FROM home_sections m WHERE m.tenant_id = h.tenant_id) AS max_pos
      FROM home_sections h
     WHERE h.kind = 'subscriptions' AND h.tenant_id IS NOT NULL
  LOOP
    CONTINUE WHEN r.pos_pkg IS NULL
                OR r.pos_sub <> r.max_pos
                OR r.pos_sub <= r.pos_pkg + 1;

    UPDATE home_sections
       SET position = position + 1, updated_at = NOW()
     WHERE tenant_id = r.tenant_id
       AND position > r.pos_pkg
       AND position < r.pos_sub;

    UPDATE home_sections
       SET position = r.pos_pkg + 1, updated_at = NOW()
     WHERE id = r.sub_id;
  END LOOP;
END $$;
