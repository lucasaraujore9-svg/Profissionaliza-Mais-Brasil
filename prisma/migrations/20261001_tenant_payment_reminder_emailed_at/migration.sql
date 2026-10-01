-- Entrega do EMAIL de cada aviso de mensalidade da unidade.
--
-- A linha de tenant_payment_reminders e gravada ANTES do disparo (idempotencia)
-- e o email saia em background, sem ninguem conferir o resultado: nos apagoes de
-- SMTP de 17 a 28/09/2026, 65 avisos ficaram marcados como "avisado" sem que o
-- email tivesse saido, e nunca mais foram tentados.
--
-- emailed_at NULL = email ainda nao aceito por nenhum provedor; o cron tenta de
-- novo na proxima execucao enquanto a cobranca seguir em aberto.
--
-- Aditiva e idempotente. O backfill roda UMA vez, junto com a criacao da coluna:
-- sem ele, todo aviso antigo de cobranca ainda em aberto seria reenviado no
-- primeiro cron depois do deploy.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tenant_payment_reminders'
      AND column_name = 'emailed_at'
  ) THEN
    ALTER TABLE tenant_payment_reminders ADD COLUMN emailed_at TIMESTAMP(3);
    UPDATE tenant_payment_reminders SET emailed_at = sent_at;
  END IF;
END $$;
