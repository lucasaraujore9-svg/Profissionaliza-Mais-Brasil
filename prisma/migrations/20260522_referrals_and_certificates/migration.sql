-- =============================================================
-- Migration: Sistema de Indicacao (1-nivel) + Certificados + Progresso
-- Data: 2026-05-22
-- Idempotente: pode ser executada multiplas vezes sem erro.
-- =============================================================

-- ============================================================
-- 1. NOVOS ENUMS
-- ============================================================

DO $$ BEGIN
  CREATE TYPE "ReferralCommissionStatus" AS ENUM ('PENDING','AVAILABLE','PAID','CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ReferralPayoutMethod" AS ENUM ('ASAAS_PIX','DESCONTO_MENSALIDADE','MANUAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ReferralPayoutStatus" AS ENUM ('REQUESTED','PROCESSING','PAID','FAILED','CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CertificateSource" AS ENUM ('AUTO','MANUAL_ADMIN','MANUAL_RESELLER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CertificateLayout" AS ENUM ('CLASSIC','MODERN','MINIMAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 2. ALTER tenants — indicacao + PIX
-- ============================================================

ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "referral_code"        TEXT,
  ADD COLUMN IF NOT EXISTS "referrer_tenant_id"   TEXT,
  ADD COLUMN IF NOT EXISTS "referral_percent"     DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS "pix_key"              TEXT,
  ADD COLUMN IF NOT EXISTS "pix_key_type"         TEXT;

-- Backfill de referral_code para tenants existentes (UPPER(slug)-XXXX)
UPDATE "tenants"
SET "referral_code" = UPPER("slug") || '-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT || "id") FROM 1 FOR 4))
WHERE "referral_code" IS NULL;

-- Reserva codigo interno do tenant placeholder PMB (slug = __pmb__)
UPDATE "tenants" SET "referral_code" = '__PMB__'
WHERE "slug" = '__pmb__' AND "referral_code" <> '__PMB__';

-- Trava NOT NULL + UNIQUE
ALTER TABLE "tenants" ALTER COLUMN "referral_code" SET NOT NULL;

DO $$ BEGIN
  CREATE UNIQUE INDEX "tenants_referral_code_key" ON "tenants"("referral_code");
EXCEPTION WHEN duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "tenants"
    ADD CONSTRAINT "tenants_referrer_tenant_id_fkey"
    FOREIGN KEY ("referrer_tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "tenants_referrer_tenant_id_idx" ON "tenants"("referrer_tenant_id");
CREATE INDEX IF NOT EXISTS "tenants_referral_code_idx"      ON "tenants"("referral_code");

-- ============================================================
-- 3. ALTER enrollments — progresso da plataforma parceira
-- ============================================================

ALTER TABLE "enrollments"
  ADD COLUMN IF NOT EXISTS "progress_percent"    INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "progress_status"     TEXT,
  ADD COLUMN IF NOT EXISTS "last_lesson_at"      TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "progress_synced_at"  TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "enrollments_progress_status_idx" ON "enrollments"("progress_status");

-- ============================================================
-- 4. ALTER tenant_payments — vinculo com payout de desconto
-- ============================================================

ALTER TABLE "tenant_payments"
  ADD COLUMN IF NOT EXISTS "applied_payout_id" TEXT;

DO $$ BEGIN
  CREATE UNIQUE INDEX "tenant_payments_applied_payout_id_key" ON "tenant_payments"("applied_payout_id");
EXCEPTION WHEN duplicate_table THEN NULL; END $$;

-- ============================================================
-- 5. ALTER system_settings — novos toggles
-- ============================================================

ALTER TABLE "system_settings"
  ADD COLUMN IF NOT EXISTS "referral_enabled"          BOOLEAN       NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "default_referral_percent"  DECIMAL(5,2)  NOT NULL DEFAULT 5.00,
  ADD COLUMN IF NOT EXISTS "referral_min_payout"       DECIMAL(10,2) NOT NULL DEFAULT 50.00,
  ADD COLUMN IF NOT EXISTS "referral_payout_day"       INTEGER       NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS "certificate_min_percent"   INTEGER       NOT NULL DEFAULT 80,
  ADD COLUMN IF NOT EXISTS "certificate_auto_issue"    BOOLEAN       NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "certificate_require_cpf"   BOOLEAN       NOT NULL DEFAULT FALSE;

-- ============================================================
-- 6. CREATE TABLE referral_commissions
-- ============================================================

CREATE TABLE IF NOT EXISTS "referral_commissions" (
  "id"                  TEXT          NOT NULL,
  "referrer_tenant_id"  TEXT          NOT NULL,
  "referred_tenant_id"  TEXT          NOT NULL,
  "tenant_payment_id"   TEXT          NOT NULL,
  "base_amount"         DECIMAL(10,2) NOT NULL,
  "percent"             DECIMAL(5,2)  NOT NULL,
  "amount"              DECIMAL(10,2) NOT NULL,
  "status"              "ReferralCommissionStatus" NOT NULL DEFAULT 'PENDING',
  "available_at"        TIMESTAMP(3)  NOT NULL,
  "paid_at"             TIMESTAMP(3),
  "cancelled_at"        TIMESTAMP(3),
  "cancel_reason"       TEXT,
  "payout_id"           TEXT,
  "created_at"          TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMP(3)  NOT NULL,
  CONSTRAINT "referral_commissions_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  CREATE UNIQUE INDEX "referral_commissions_tenant_payment_id_key" ON "referral_commissions"("tenant_payment_id");
EXCEPTION WHEN duplicate_table THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "referral_commissions_referrer_status_idx"  ON "referral_commissions"("referrer_tenant_id","status");
CREATE INDEX IF NOT EXISTS "referral_commissions_referred_idx"         ON "referral_commissions"("referred_tenant_id");
CREATE INDEX IF NOT EXISTS "referral_commissions_status_available_idx" ON "referral_commissions"("status","available_at");
CREATE INDEX IF NOT EXISTS "referral_commissions_payout_idx"           ON "referral_commissions"("payout_id");

DO $$ BEGIN
  ALTER TABLE "referral_commissions" ADD CONSTRAINT "referral_commissions_referrer_tenant_id_fkey"
    FOREIGN KEY ("referrer_tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "referral_commissions" ADD CONSTRAINT "referral_commissions_referred_tenant_id_fkey"
    FOREIGN KEY ("referred_tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "referral_commissions" ADD CONSTRAINT "referral_commissions_tenant_payment_id_fkey"
    FOREIGN KEY ("tenant_payment_id") REFERENCES "tenant_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 7. CREATE TABLE referral_payouts
-- ============================================================

CREATE TABLE IF NOT EXISTS "referral_payouts" (
  "id"                  TEXT          NOT NULL,
  "referrer_tenant_id"  TEXT          NOT NULL,
  "amount"              DECIMAL(10,2) NOT NULL,
  "method"              "ReferralPayoutMethod" NOT NULL DEFAULT 'ASAAS_PIX',
  "status"              "ReferralPayoutStatus" NOT NULL DEFAULT 'REQUESTED',
  "pix_key"             TEXT,
  "pix_key_type"        TEXT,
  "asaas_transfer_id"   TEXT,
  "failure_reason"      TEXT,
  "notes"               TEXT,
  "requested_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at"        TIMESTAMP(3),
  "paid_at"             TIMESTAMP(3),
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMP(3) NOT NULL,
  CONSTRAINT "referral_payouts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "referral_payouts_referrer_status_idx"   ON "referral_payouts"("referrer_tenant_id","status");
CREATE INDEX IF NOT EXISTS "referral_payouts_status_requested_idx"  ON "referral_payouts"("status","requested_at");

DO $$ BEGIN
  ALTER TABLE "referral_payouts" ADD CONSTRAINT "referral_payouts_referrer_tenant_id_fkey"
    FOREIGN KEY ("referrer_tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- FK referral_commissions.payout_id -> referral_payouts.id (depois de referral_payouts existir)
DO $$ BEGIN
  ALTER TABLE "referral_commissions" ADD CONSTRAINT "referral_commissions_payout_id_fkey"
    FOREIGN KEY ("payout_id") REFERENCES "referral_payouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- FK tenant_payments.applied_payout_id -> referral_payouts.id
DO $$ BEGIN
  ALTER TABLE "tenant_payments" ADD CONSTRAINT "tenant_payments_applied_payout_id_fkey"
    FOREIGN KEY ("applied_payout_id") REFERENCES "referral_payouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 8. CREATE TABLE certificate_templates
-- ============================================================

CREATE TABLE IF NOT EXISTS "certificate_templates" (
  "id"                  TEXT NOT NULL,
  "tenant_id"           TEXT,
  "layout"              "CertificateLayout" NOT NULL DEFAULT 'CLASSIC',
  "background_url"      TEXT,
  "logo_url"            TEXT,
  "seal_url"            TEXT,
  "signature_url"       TEXT,
  "primary_color"       TEXT,
  "secondary_color"     TEXT,
  "title_text"          TEXT NOT NULL DEFAULT 'CERTIFICADO DE CONCLUSAO',
  "body_text"           TEXT NOT NULL DEFAULT 'Certificamos que {nome} concluiu com aproveitamento o curso de {curso}, com carga horaria de {carga_horaria}, em {data_conclusao}.',
  "footer_text"         TEXT,
  "signer_name"         TEXT,
  "signer_title"        TEXT,
  "show_qr_code"        BOOLEAN NOT NULL DEFAULT TRUE,
  "show_validation_url" BOOLEAN NOT NULL DEFAULT TRUE,
  "show_seal"           BOOLEAN NOT NULL DEFAULT FALSE,
  "is_active"           BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMP(3) NOT NULL,
  CONSTRAINT "certificate_templates_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  CREATE UNIQUE INDEX "certificate_templates_tenant_id_key" ON "certificate_templates"("tenant_id");
EXCEPTION WHEN duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "certificate_templates" ADD CONSTRAINT "certificate_templates_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 9. CREATE TABLE certificates
-- ============================================================

CREATE TABLE IF NOT EXISTS "certificates" (
  "id"                  TEXT NOT NULL,
  "code"                TEXT NOT NULL,
  "student_id"          TEXT NOT NULL,
  "enrollment_id"       TEXT NOT NULL,
  "course_id"           TEXT NOT NULL,
  "tenant_id"           TEXT,
  "student_name"        TEXT NOT NULL,
  "student_cpf"         TEXT,
  "course_name"         TEXT NOT NULL,
  "carga_horaria"       TEXT,
  "completion_date"     TIMESTAMP(3) NOT NULL,
  "template_snapshot"   JSONB NOT NULL,
  "pdf_url"             TEXT,
  "pdf_generated_at"    TIMESTAMP(3),
  "source"              "CertificateSource" NOT NULL,
  "issued_by_user_id"   TEXT,
  "revoked_at"          TIMESTAMP(3),
  "revoked_reason"      TEXT,
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMP(3) NOT NULL,
  CONSTRAINT "certificates_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  CREATE UNIQUE INDEX "certificates_code_key" ON "certificates"("code");
EXCEPTION WHEN duplicate_table THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "certificates_student_idx"           ON "certificates"("student_id");
CREATE INDEX IF NOT EXISTS "certificates_enrollment_idx"        ON "certificates"("enrollment_id");
CREATE INDEX IF NOT EXISTS "certificates_tenant_course_idx"     ON "certificates"("tenant_id","course_id");
CREATE INDEX IF NOT EXISTS "certificates_code_idx"              ON "certificates"("code");
CREATE INDEX IF NOT EXISTS "certificates_revoked_idx"           ON "certificates"("revoked_at");

DO $$ BEGIN
  ALTER TABLE "certificates" ADD CONSTRAINT "certificates_student_id_fkey"
    FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "certificates" ADD CONSTRAINT "certificates_enrollment_id_fkey"
    FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "certificates" ADD CONSTRAINT "certificates_course_id_fkey"
    FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "certificates" ADD CONSTRAINT "certificates_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================================================
-- FIM
-- =============================================================
