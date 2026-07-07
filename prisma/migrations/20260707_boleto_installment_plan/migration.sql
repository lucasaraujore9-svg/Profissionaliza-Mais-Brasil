-- Venda parcelada no boleto (carne) — venda direta da revenda.
-- Idempotente (IF NOT EXISTS / DO blocks). Roda apos 20260707_boleto_installment_enum.

-- Status de cada parcela
DO $$ BEGIN
  CREATE TYPE "BoletoInstallmentStatus" AS ENUM ('SCHEDULED', 'GENERATED', 'PAID', 'OVERDUE', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Tenant: capability liberada pelo admin + toggle da revenda + teto de parcelas
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "boleto_installment_allowed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "boleto_installment_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "boleto_installment_max_count" INTEGER NOT NULL DEFAULT 12;

-- Enrollment: id do carne (parcelamento boleto) no Asaas
ALTER TABLE "enrollments" ADD COLUMN IF NOT EXISTS "asaas_installment_id" TEXT;

-- Uma parcela (boleto) por linha
CREATE TABLE IF NOT EXISTS "boleto_installments" (
  "id" TEXT NOT NULL,
  "enrollment_id" TEXT NOT NULL,
  "tenant_id" TEXT,
  "number" INTEGER NOT NULL,
  "amount" DECIMAL(10, 2) NOT NULL,
  "due_date" TIMESTAMP(3) NOT NULL,
  "status" "BoletoInstallmentStatus" NOT NULL DEFAULT 'SCHEDULED',
  "gateway" "PaymentGateway" NOT NULL,
  "invoice_url" TEXT,
  "digitable_line" TEXT,
  "generated_at" TIMESTAMP(3),
  "mp_payment_id" TEXT,
  "asaas_payment_id" TEXT,
  "paid_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "boleto_installments_pkey" PRIMARY KEY ("id")
);

-- FK -> enrollments (cascade no delete da matricula)
DO $$ BEGIN
  ALTER TABLE "boleto_installments"
    ADD CONSTRAINT "boleto_installments_enrollment_id_fkey"
    FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Uniques (NULLs multiplos sao permitidos: parcela sem boleto emitido tem id null)
CREATE UNIQUE INDEX IF NOT EXISTS "boleto_installments_mp_payment_id_key" ON "boleto_installments" ("mp_payment_id");
CREATE UNIQUE INDEX IF NOT EXISTS "boleto_installments_asaas_payment_id_key" ON "boleto_installments" ("asaas_payment_id");
CREATE UNIQUE INDEX IF NOT EXISTS "boleto_installments_enrollment_id_number_key" ON "boleto_installments" ("enrollment_id", "number");

-- Indices de consulta (cron varre por status+vencimento; escopo por tenant)
CREATE INDEX IF NOT EXISTS "boleto_installments_enrollment_id_idx" ON "boleto_installments" ("enrollment_id");
CREATE INDEX IF NOT EXISTS "boleto_installments_status_due_date_idx" ON "boleto_installments" ("status", "due_date");
CREATE INDEX IF NOT EXISTS "boleto_installments_tenant_id_idx" ON "boleto_installments" ("tenant_id");
