-- =============================================================
-- Migration: lembretes de vencimento da mensalidade da unidade
--
-- Livro-caixa de idempotencia do cron `tenant-payment-reminders`: uma linha por
-- (cobranca, janela). Janelas: 5 dias antes, 2 dias antes e no dia (offset 0).
-- A linha e gravada ANTES do disparo — quem insere e o dono do aviso, entao uma
-- segunda execucao no mesmo dia nao reenvia nada.
--
-- Idempotente (roda como 1 transacao no apply-pending-migrations).
-- =============================================================

CREATE TABLE IF NOT EXISTS "tenant_payment_reminders" (
  "tenant_payment_id" TEXT      NOT NULL,
  "offset_days"       INTEGER   NOT NULL,
  "sent_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tenant_payment_reminders_pkey"
    PRIMARY KEY ("tenant_payment_id", "offset_days")
);

CREATE INDEX IF NOT EXISTS "tenant_payment_reminders_sent_at_idx"
  ON "tenant_payment_reminders" ("sent_at");

-- FK com ON DELETE CASCADE: cobranca removida leva os lembretes junto.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tenant_payment_reminders_tenant_payment_id_fkey'
  ) THEN
    ALTER TABLE "tenant_payment_reminders"
      ADD CONSTRAINT "tenant_payment_reminders_tenant_payment_id_fkey"
      FOREIGN KEY ("tenant_payment_id") REFERENCES "tenant_payments"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
