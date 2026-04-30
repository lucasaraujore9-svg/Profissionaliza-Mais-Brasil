-- CreateEnum
CREATE TYPE "PaymentGateway" AS ENUM ('MP', 'ASAAS');

-- AlterTable enrollments
ALTER TABLE "enrollments"
  ADD COLUMN "gateway" "PaymentGateway" NOT NULL DEFAULT 'MP',
  ADD COLUMN "asaas_customer_id" TEXT,
  ADD COLUMN "asaas_payment_id" TEXT,
  ADD COLUMN "asaas_invoice_url" TEXT;

CREATE INDEX "enrollments_asaas_payment_id_idx" ON "enrollments"("asaas_payment_id");

-- AlterTable payments
ALTER TABLE "payments"
  ADD COLUMN "gateway" "PaymentGateway" NOT NULL DEFAULT 'MP',
  ADD COLUMN "asaas_payment_id" TEXT;

ALTER TABLE "payments" ALTER COLUMN "mp_payment_id" DROP NOT NULL;

CREATE UNIQUE INDEX "payments_asaas_payment_id_key" ON "payments"("asaas_payment_id");

-- CreateTable system_settings
CREATE TABLE "system_settings" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "pmb_direct_sale_gateway" "PaymentGateway" NOT NULL DEFAULT 'MP',
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- Insert singleton row
INSERT INTO "system_settings" ("id", "pmb_direct_sale_gateway", "updated_at")
VALUES ('default', 'MP', NOW())
ON CONFLICT ("id") DO NOTHING;
