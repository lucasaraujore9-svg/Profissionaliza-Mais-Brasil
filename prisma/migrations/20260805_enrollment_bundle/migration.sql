-- Venda direta com MAIS DE UM CURSO (avulsa, sem pacote no catalogo) + ponteiro
-- explicito da SATELITE para a matricula que carrega a cobranca.
--
-- Idempotente: aplicada automaticamente no build por scripts/apply-pending-migrations.mjs
-- e segura para re-execucao (IF NOT EXISTS / DO block no FK / backfill condicional).
--
-- Mesma mecanica ja usada pelos pacotes: a matricula PRIMARIA carrega o Payment
-- do valor somado e lista em `bundle_course_ids` os cursos EXTRA da venda (o 1o
-- fica em `course_id`); no fulfill cada extra vira uma matricula SATELITE
-- (final_amount 0, sem Payment) apontando de volta por `primary_enrollment_id`.
--
-- `primary_enrollment_id` vale para os DOIS casos (pacote e venda multi-curso):
-- e por ele que a cota de aulas descobre o parcelamento de uma satelite, que
-- nao tem cobranca propria. Sem o ponteiro, o curso 2 de uma venda em 6x saia
-- 100% liberado ja na 1a parcela.

ALTER TABLE "enrollments"
  ADD COLUMN IF NOT EXISTS "bundle_course_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "enrollments"
  ADD COLUMN IF NOT EXISTS "primary_enrollment_id" TEXT;

-- Usado pelo cancelamento em cascata e pela resolucao do plano da cota.
CREATE INDEX IF NOT EXISTS "enrollments_primary_enrollment_id_idx"
  ON "enrollments" ("primary_enrollment_id");

-- Auto-referencia. ON DELETE SET NULL espelha o course_package_id: apagar a
-- primaria nunca deve apagar em cascata o acesso ja liberado do aluno.
DO $$
BEGIN
  ALTER TABLE "enrollments"
    ADD CONSTRAINT "enrollments_primary_enrollment_id_fkey"
    FOREIGN KEY ("primary_enrollment_id") REFERENCES "enrollments"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ── Backfill das satelites de PACOTE ja existentes ─────────────────────────
-- Elas nasceram antes do ponteiro (o vinculo era so course_package_id +
-- package_primary). Sem este backfill, uma compra de pacote em carne feita
-- ANTES deste deploy continuaria com os cursos 2..N fora da cota.
--
-- Condicional (`WHERE primary_enrollment_id IS NULL`) => re-executavel.
-- O par (student_id, course_package_id) identifica a compra; `package_primary`
-- marca qual delas carregou o pagamento.
--
-- DESEMPATE OBRIGATORIO: o par (student_id, course_package_id) NAO e unico — o
-- mesmo aluno pode ter comprado o mesmo pacote duas vezes (a 1a cancelada, a 2a
-- em carne; o gate de duplicidade so bloqueia enquanto a anterior esta
-- PENDING/ACTIVE/COMPLETED). Um `UPDATE ... FROM` simples casaria a satelite com
-- QUALQUER uma das primarias candidatas, a criterio do planner. Ligar na errada
-- nao e um erro pequeno: herdar o plano ONE_TIME de uma compra a vista antiga
-- libera o curso 100% com uma parcela paga (e emite o certificado), e o inverso
-- prende para sempre em 16% um curso ja quitado.
--
-- Criterio: a primaria MAIS RECENTE criada ATE o instante da satelite. A
-- satelite nasce no fulfill, segundos depois da primaria da sua propria compra,
-- entao essa e a compra a que ela pertence. `id` no fim so para tornar a escolha
-- estavel se dois `created_at` empatarem ao microssegundo.
UPDATE "enrollments" AS sat
SET "primary_enrollment_id" = (
  SELECT pri."id"
  FROM "enrollments" AS pri
  WHERE pri."course_package_id" = sat."course_package_id"
    AND pri."student_id" = sat."student_id"
    AND pri."package_primary" = true
    AND pri."id" <> sat."id"
  ORDER BY
    (pri."created_at" <= sat."created_at") DESC,
    pri."created_at" DESC,
    pri."id" ASC
  LIMIT 1
)
WHERE sat."primary_enrollment_id" IS NULL
  AND sat."course_package_id" IS NOT NULL
  AND sat."package_primary" = false
  -- Sem candidata nenhuma a subquery devolveria NULL e o UPDATE reescreveria
  -- NULL sobre NULL (ruido no WAL, sem efeito). O EXISTS mantem o backfill
  -- restrito as linhas que ele de fato resolve.
  AND EXISTS (
    SELECT 1
    FROM "enrollments" AS pri2
    WHERE pri2."course_package_id" = sat."course_package_id"
      AND pri2."student_id" = sat."student_id"
      AND pri2."package_primary" = true
      AND pri2."id" <> sat."id"
  );
