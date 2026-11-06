-- Venda direta parcelada com meio escolhido pelo aluno (spec 2026-11-06).
-- Aditiva, idempotente, sem backfill (default false / null = venda antiga).
DO $$ BEGIN
  CREATE TYPE "InstallmentMethod" AS ENUM ('PIX', 'BOLETO', 'CREDIT_CARD');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "enrollments" ADD COLUMN IF NOT EXISTS "flex_installments" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "enrollments" ADD COLUMN IF NOT EXISTS "flex_has_down_payment" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "enrollments" ADD COLUMN IF NOT EXISTS "installment_method" "InstallmentMethod";
ALTER TABLE "boleto_installments" ADD COLUMN IF NOT EXISTS "method" "InstallmentMethod";
ALTER TABLE "boleto_installments" ADD COLUMN IF NOT EXISTS "card_declined_at" TIMESTAMP(3);
ALTER TABLE "boleto_installments" ADD COLUMN IF NOT EXISTS "available_email_sent_at" TIMESTAMP(3);
