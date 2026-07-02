-- ============================================================================
-- Correcao de dados: revendas presas no preco-placeholder 999
-- ============================================================================
-- Contexto:
--   A fornecedora EA nao expoe preco real via API: retorna "999" em `preco` e
--   `preco_promocional` para TODOS os cursos (sentinela). O preco real da EA
--   vive em `courses.preco_vitrine_main` (curadoria do admin) e NUNCA e tocado
--   pelo sync. Quando um TenantCourse de revenda foi criado ANTES de o admin
--   preencher `preco_vitrine_main`, o seed
--   (`preco_vitrine_main ?? preco_promocional ?? preco_original`) herdou o 999
--   junk — deixando ~136 revendas vendendo cursos EA a R$ 999.
--
--   O sync nao reverte o preco da revenda (`tenant_courses.price`), entao esses
--   999 ficavam presos ate a revenda editar manualmente. Esta migration corrige
--   as linhas presas, adotando o preco curado pelo admin.
--
-- Escopo/seguranca:
--   - So cursos EA (onde 999 e comprovadamente o sentinela junk do feed).
--   - So quando existe um preco curado real (`preco_vitrine_main` nao-nulo e
--     diferente de 999) para adotar.
--   - Idempotente: apos rodar, nenhuma linha casa a condicao (no-op ao reexecutar).
-- ============================================================================

UPDATE tenant_courses AS tc
SET price = c.preco_vitrine_main,
    updated_at = now()
FROM courses AS c
WHERE tc.course_id = c.id
  AND tc.price = 999
  AND c.provider = 'EA'
  AND c.preco_vitrine_main IS NOT NULL
  AND c.preco_vitrine_main <> 999;
