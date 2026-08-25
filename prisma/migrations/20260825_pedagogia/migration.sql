-- Regras pedagogicas: a unidade define COMO as aulas sao liberadas.
--
-- Tres eixos independentes (ordem / ritmo / horario) guardados como UM bloco
-- JSON, no molde de `cancellation_policy` e `commission_plan`: o bloco viaja
-- inteiro para a plataforma de aulas e ganha eixos novos sem migration.
--
-- Aditiva e idempotente. SEM backfill: NULL em `pedagogy_policy` significa "sem
-- regra", que e exatamente o comportamento de hoje — nenhuma unidade e nenhum
-- aluno muda de estado ao aplicar esta migration.

-- ── Politica da unidade (padrao de toda a vitrine dela) ─────────────────────
ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "pedagogy_policy" JSONB;

-- ── Override por curso NAQUELA vitrine (NULL = herda a unidade) ─────────────
ALTER TABLE "tenant_courses"
  ADD COLUMN IF NOT EXISTS "pedagogy_policy" JSONB;

-- ── Discriminador da trava por JANELA DE HORARIO na fornecedora legada ──────
-- `students.status` e um enum unico e BLOQUEADO ja pertence a inadimplencia.
-- Sem esta coluna, a liberacao da manha nao teria como distinguir "travado pelo
-- relogio" de "travado por divida" — e devolveria acesso a um inadimplente.
ALTER TABLE "students"
  ADD COLUMN IF NOT EXISTS "schedule_blocked_at" TIMESTAMP(3);

-- Indice PARCIAL: a varredura so procura quem esta travado pelo relogio, e eles
-- sao poucos e transitorios. Um indice cheio pagaria por 230 linhas para
-- responder sobre um punhado.
--
-- NAO usa CREATE INDEX CONCURRENTLY: build abortada no meio deixa um indice
-- INVALID que o `IF NOT EXISTS` passa a PULAR para sempre (licao de
-- 20260807_tenant_payments_ever_paid_idx). A tabela e pequena e o lock e curto.
CREATE INDEX IF NOT EXISTS "students_schedule_blocked_at_idx"
  ON "students" ("schedule_blocked_at")
  WHERE "schedule_blocked_at" IS NOT NULL;
