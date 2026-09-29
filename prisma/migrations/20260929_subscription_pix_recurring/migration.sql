-- =============================================================
-- Migration: assinatura no PIX (carne de PIX) + Pix Automatico
-- Data: 2026-09-29
-- Idempotente. Aditiva. Sem backfill.
--
-- O carne da assinatura (a plataforma emite a cobranca de cada ciclo) passa a
-- aceitar PIX alem de boleto, nos dois gateways — o Mercado Pago nao tinha
-- assinatura no PIX. No Asaas, a 1a cobranca do carne no PIX e o QR de uma
-- autorizacao de Pix Automatico: ativa, os ciclos seguintes sao debitados.
--
-- student_subscriptions.pix_automatic_authorization_id
--   Id da autorizacao no Asaas. NULL em todas as linhas existentes: nenhuma
--   assinatura muda de comportamento.
-- =============================================================

ALTER TABLE "student_subscriptions"
  ADD COLUMN IF NOT EXISTS "pix_automatic_authorization_id" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "student_subscriptions_pix_automatic_authorization_id_key"
  ON "student_subscriptions"("pix_automatic_authorization_id");
