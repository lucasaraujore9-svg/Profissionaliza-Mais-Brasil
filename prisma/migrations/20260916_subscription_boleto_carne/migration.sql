-- =============================================================
-- Migration: assinatura no boleto (carne)
-- Data: 2026-09-16
-- Idempotente. Aditiva. Sem backfill.
--
-- A estrutura do carne (venda parcelada no boleto) passa a valer para a
-- assinatura, nos dois gateways: a plataforma emite UM boleto por ciclo, na
-- conta da loja, e renova sozinha. Antes o Mercado Pago so aceitava assinatura
-- no cartao, e as 4 unidades com o modulo ligado usam Mercado Pago.
--
-- 1) student_subscriptions.boleto_carne
--    Discriminador: a assinatura e cobrada por boletos que a PLATAFORMA emite,
--    sem recorrencia no gateway. Nasce false em todas as linhas — nenhuma
--    assinatura existente muda de comportamento.
--
-- 2) subscription_payments.number / digitable_line / generated_at / emit_attempts
--    Os boletos do carne sao linhas de subscription_payments numeradas 1..N.
--    `number` NULL = cobranca emitida pelo proprio gateway (o que ja existia),
--    e o indice unico nao os alcanca (NULL e distinto no Postgres).
-- =============================================================

ALTER TABLE "student_subscriptions"
  ADD COLUMN IF NOT EXISTS "boleto_carne" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "subscription_payments"
  ADD COLUMN IF NOT EXISTS "number" INTEGER,
  ADD COLUMN IF NOT EXISTS "digitable_line" TEXT,
  ADD COLUMN IF NOT EXISTS "generated_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "emit_attempts" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS "subscription_payments_subscription_id_number_key"
  ON "subscription_payments" ("subscription_id", "number");
