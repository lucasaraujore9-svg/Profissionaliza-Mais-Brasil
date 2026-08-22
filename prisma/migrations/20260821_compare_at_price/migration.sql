-- Preco de tabela editavel (o "De R$ X" riscado da vitrine).
--
-- Ate aqui o "De" saia de `courses.preco_original`, que e PROPRIEDADE DO SYNC:
-- o feed da EA e o `suggestedPriceCents` do LMS reescrevem essa coluna todo dia
-- as 6h. Ou seja, nao havia como edita-lo — qualquer valor digitado ali voltaria
-- ao do fornecedor na manha seguinte. As duas colunas abaixo sao OVERRIDE puro,
-- que nenhum sync toca (mesma disciplina de `preco_vitrine_main`):
--
--   courses.preco_de_vitrine_main  -> o "De" da vitrine PMB (curadoria admin)
--   tenant_courses.preco_de        -> o "De" da vitrine da unidade
--
-- Regra nova: coluna vazia => a vitrine NAO exibe "De". Nao existe mais fallback
-- para `preco_original`.
--
-- Aditiva e idempotente. O BACKFILL abaixo roda UMA UNICA VEZ, e so quando a
-- coluna esta sendo criada agora: ele copia o valor que a vitrine JA exibia
-- hoje, para que o deploy nao apague o "De" de 123 cursos da PMB e de ~18 mil
-- cursos espalhados por 137 unidades. Re-executar a migration depois NAO
-- ressuscita valor que alguem tenha apagado de proposito — por isso o backfill
-- vive dentro do IF NOT EXISTS da coluna, e nao num UPDATE ... WHERE IS NULL.

-- ── courses.preco_de_vitrine_main ───────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'courses'
      AND column_name = 'preco_de_vitrine_main'
  ) THEN
    ALTER TABLE "courses" ADD COLUMN "preco_de_vitrine_main" DECIMAL(10,2);

    -- Espelha exatamente o guard de render de hoje: so ha "De" quando o preco
    -- do fornecedor e MAIOR que o preco de venda efetivo. O COALESCE reproduz a
    -- cascata `precoVitrineMain ?? precoPromocional ?? precoOriginal` — quando
    -- ela cai no proprio preco_original, `>` e falso e a linha nao e tocada.
    UPDATE "courses"
       SET "preco_de_vitrine_main" = "preco_original"
     WHERE "preco_original" IS NOT NULL
       AND "preco_original" > COALESCE(
             "preco_vitrine_main", "preco_promocional", "preco_original"
           );
  END IF;
END $$;

-- ── tenant_courses.preco_de ─────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tenant_courses'
      AND column_name = 'preco_de'
  ) THEN
    ALTER TABLE "tenant_courses" ADD COLUMN "preco_de" DECIMAL(10,2);

    -- Na vitrine da unidade o preco de venda e `tenant_courses.price` (nao a
    -- cascata do catalogo mae), entao a comparacao e direta. Vale tambem para
    -- linhas ocultas: se a unidade voltar a exibir o curso, ele volta igual.
    UPDATE "tenant_courses" tc
       SET "preco_de" = c."preco_original"
      FROM "courses" c
     WHERE c."id" = tc."course_id"
       AND c."preco_original" IS NOT NULL
       AND c."preco_original" > tc."price";
  END IF;
END $$;
