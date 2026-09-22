-- Caixas SMTP cadastradas pelo /admin (rodizio de envio, 100/dia por caixa).
-- Aditiva e idempotente, sem backfill: sem linha aqui o envio segue pelo
-- SMTP_* das variaveis de ambiente, como hoje.
CREATE TABLE IF NOT EXISTS "smtp_accounts" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "password_enc" TEXT NOT NULL,
  "host" TEXT NOT NULL DEFAULT 'smtp.hostinger.com',
  "port" INTEGER NOT NULL DEFAULT 465,
  "daily_limit" INTEGER NOT NULL DEFAULT 100,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sent_day" TEXT NOT NULL DEFAULT '',
  "sent_count" INTEGER NOT NULL DEFAULT 0,
  "alerted_day" TEXT,
  "last_error" TEXT,
  "last_error_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "smtp_accounts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "smtp_accounts_email_key" ON "smtp_accounts"("email");
-- Tabela so do servidor (Prisma); fecha o acesso pela API publica do Supabase.
ALTER TABLE "smtp_accounts" ENABLE ROW LEVEL SECURITY;
