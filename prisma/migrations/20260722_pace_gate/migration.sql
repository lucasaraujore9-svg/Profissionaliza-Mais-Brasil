-- Cota de aulas: trava de conclusao proporcional ao pagamento na venda parcelada.
-- Idempotente: aplicada automaticamente no build por scripts/apply-pending-migrations.mjs
-- e segura para re-execucao (IF NOT EXISTS).
--
-- Nenhuma coluna guarda a cota em si — ela e sempre recalculada de
-- installments_paid/installments_total (src/lib/enrollment/pace-gate.ts). O que
-- persiste aqui e (a) o que ja foi propagado ao provedor, para nao rechamar
-- EA/LMS a cada varredura, e (b) o estado exibido na UI.

-- enrollments: estado da cota por matricula
ALTER TABLE "enrollments" ADD COLUMN IF NOT EXISTS "pace_applied_percent" INTEGER;
ALTER TABLE "enrollments" ADD COLUMN IF NOT EXISTS "pace_blocked_at" TIMESTAMP(3);
ALTER TABLE "enrollments" ADD COLUMN IF NOT EXISTS "pace_exempt_at" TIMESTAMP(3);
ALTER TABLE "enrollments" ADD COLUMN IF NOT EXISTS "pace_exempt_by_user_id" TEXT;

-- A fase C do sweep do carne le so as matriculas ja travadas (poucas).
CREATE INDEX IF NOT EXISTS "enrollments_pace_blocked_at_idx"
  ON "enrollments" ("pace_blocked_at");

-- system_settings: interruptor global (sobe DESLIGADO) + politica do corte na EA.
-- pace_gate_strict=false (padrao) so corta o login quando TODAS as matriculas
-- dele estao travadas — o status da EA e por login, e 28,6% dos logins tem mais
-- de um curso ativo (medido em 2026-07-22).
ALTER TABLE "system_settings" ADD COLUMN IF NOT EXISTS "pace_gate_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "system_settings" ADD COLUMN IF NOT EXISTS "pace_gate_strict" BOOLEAN NOT NULL DEFAULT false;

-- tenants: override por unidade (NULL = herda o global).
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "pace_gate_enabled" BOOLEAN;
