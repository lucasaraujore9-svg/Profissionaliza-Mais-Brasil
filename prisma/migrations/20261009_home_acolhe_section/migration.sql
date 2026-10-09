-- Banner "Acolhe Mais Brasil" vira seção própria da home (kind = 'acolhe').
-- Antes ele era fixo no código, preso à seção "Diversas áreas": não dava para
-- mover nem desativar. Agora nasce logo APÓS "Mais vendidos" e, daí em diante,
-- PMB e unidades movem ou desativam como qualquer outra seção.
--
-- Sem schema novo: só linhas de home_sections, para o banner aparecer sem
-- ninguém precisar abrir o editor da vitrine. Escopos: a PMB (tenant_id NULL) e
-- toda unidade que já tem seções próprias — as demais leem as da PMB, e as
-- novas as clonam (ensureTenantHomeSections).
--
-- enabled = TRUE. Idempotente (escopo que já tem a linha é pulado), sem backfill.

DO $$
DECLARE
  r RECORD;
  anchor_pos INTEGER;
BEGIN
  FOR r IN
    SELECT NULL::TEXT AS tenant_id
     WHERE NOT EXISTS (
       SELECT 1 FROM home_sections WHERE tenant_id IS NULL AND kind = 'acolhe'
     )
    UNION ALL
    SELECT t.id
      FROM tenants t
     WHERE EXISTS (SELECT 1 FROM home_sections h WHERE h.tenant_id = t.id)
       AND NOT EXISTS (
         SELECT 1 FROM home_sections h WHERE h.tenant_id = t.id AND h.kind = 'acolhe'
       )
  LOOP
    SELECT position INTO anchor_pos
      FROM home_sections
     WHERE tenant_id IS NOT DISTINCT FROM r.tenant_id AND kind = 'bestsellers'
     ORDER BY position ASC LIMIT 1;
    -- Sem "Mais vendidos": vai para o fim do escopo.
    IF anchor_pos IS NULL THEN
      SELECT COALESCE(MAX(position), -1) INTO anchor_pos
        FROM home_sections WHERE tenant_id IS NOT DISTINCT FROM r.tenant_id;
    END IF;

    UPDATE home_sections
       SET position = position + 1, updated_at = NOW()
     WHERE tenant_id IS NOT DISTINCT FROM r.tenant_id AND position > anchor_pos;

    INSERT INTO home_sections (id, tenant_id, kind, position, enabled, config, updated_at)
    VALUES (
      COALESCE('acolhe-' || r.tenant_id, 'pmb-acolhe'),
      r.tenant_id,
      'acolhe',
      anchor_pos + 1,
      TRUE,
      jsonb_build_object('kind', 'acolhe'),
      NOW()
    );
  END LOOP;
END $$;
