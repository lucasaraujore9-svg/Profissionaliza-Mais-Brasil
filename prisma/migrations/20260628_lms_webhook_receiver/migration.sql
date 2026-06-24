-- Webhook receiver de ENTRADA do LMS (LMS -> PMB): novo source no enum +
-- external_event_id para idempotencia por X-PMB-Event-Id.
-- Idempotente e segura para re-execucao. ADD VALUE roda em transacao no PG12+
-- desde que o valor nao seja USADO na mesma transacao (so adicionamos aqui).

ALTER TYPE "WebhookSource" ADD VALUE IF NOT EXISTS 'LMS';

ALTER TABLE "webhook_logs" ADD COLUMN IF NOT EXISTS "external_event_id" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "webhook_logs_external_event_id_key"
  ON "webhook_logs" ("external_event_id");
