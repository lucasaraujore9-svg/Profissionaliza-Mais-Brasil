-- =============================================================
-- Migration: id do QR da autorizacao de Pix Automatico
-- Data: 2026-10-01
-- Idempotente. Aditiva. Sem backfill.
--
-- O pagamento do 1o ciclo de uma assinatura no Pix Automatico chega do Asaas
-- sem externalReference e no cliente do PAGADOR (a conta bancaria de quem
-- pagou), nao no cliente da autorizacao. O webhook casava so pelo cliente, o
-- pagamento caia em "matricula nao encontrada" e a assinatura ficava PENDING:
-- o aluno pagava de novo pela area do aluno (Capacita Pro Brasil, 30/09/2026).
--
-- student_subscriptions.pix_automatic_qr_id
--   immediateQrCode.conciliationIdentifier da autorizacao, que volta como
--   payment.pixQrCodeId. NULL nas linhas existentes: elas seguem casando so
--   pelo cliente, como antes.
-- =============================================================

ALTER TABLE "student_subscriptions"
  ADD COLUMN IF NOT EXISTS "pix_automatic_qr_id" TEXT;

CREATE INDEX IF NOT EXISTS "student_subscriptions_pix_automatic_qr_id_idx"
  ON "student_subscriptions"("pix_automatic_qr_id");
