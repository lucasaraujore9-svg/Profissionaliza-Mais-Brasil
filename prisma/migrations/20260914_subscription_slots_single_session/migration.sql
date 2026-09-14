-- =============================================================
-- Migration: vagas da assinatura + um acesso por vez
-- Data: 2026-09-14
-- Idempotente. Aditiva. Sem backfill.
--
-- 1) enrollments.subscription_slot_released_at
--    A assinatura passa a ter no maximo 10 cursos EM ANDAMENTO ao mesmo tempo.
--    Para abrir o 11o, o aluno tira um da lista. A matricula tirada vai para
--    CANCELLED e esta coluna e o que a distingue de um cancelamento de verdade:
--    na plataforma de aulas a matricula e revogada SEM apagar o progresso, e
--    "Retomar" a religa de onde parou. Nasce NULL em todas as linhas — nenhuma
--    foi tirada da lista.
--
-- 2) students.active_session_id / active_session_at
--    Identificador da UNICA sessao valida do aluno. Cada login grava um novo, e
--    o JWT que nao carregar o mesmo valor e recusado. Nasce NULL: todo JWT
--    emitido antes do deploy fica sem par e o aluno entra de novo UMA vez. E
--    deliberado — aceitar token antigo manteria vivos, por ate 30 dias, os
--    aparelhos que ja compartilham a conta hoje.
--    `active_session_at` e quando essa sessao comecou: um login direto na
--    plataforma de aulas so derruba a sessao daqui se ela for anterior.
-- =============================================================

ALTER TABLE "enrollments"
  ADD COLUMN IF NOT EXISTS "subscription_slot_released_at" TIMESTAMP(3);

ALTER TABLE "students"
  ADD COLUMN IF NOT EXISTS "active_session_id" TEXT,
  ADD COLUMN IF NOT EXISTS "active_session_at" TIMESTAMP(3);
