-- Trilha de auditoria de envios de email (EmailLog).
--
-- Antes, falhas de envio iam só para o stdout (Pino) e o dono não tinha como
-- saber o que não foi entregue. Esta tabela registra TODA tentativa (SENT/FAILED)
-- gravada best-effort por `sendEmail`. Idempotente — pode reaplicar sem efeito.

CREATE TABLE IF NOT EXISTS "email_logs" (
  "id" TEXT NOT NULL,
  "to" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "template" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "error" TEXT,
  "tenant_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "email_logs_status_created_at_idx" ON "email_logs"("status", "created_at");
CREATE INDEX IF NOT EXISTS "email_logs_to_idx" ON "email_logs"("to");
CREATE INDEX IF NOT EXISTS "email_logs_tenant_id_idx" ON "email_logs"("tenant_id");
