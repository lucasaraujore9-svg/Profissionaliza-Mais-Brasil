-- =============================================================
-- Migration: Modulo Automacao (WhatsApp) + CRM Kanban de Leads B2C
-- Data: 2026-05-27
-- Idempotente.
-- - Adiciona campos automation_* e wa_* no Tenant (toggle + sessao WhatsApp)
-- - Cria enums StudentLeadStage, StudentLeadSource, StudentLeadActivityKind,
--   AutomationTemplateKey
-- - Cria tabelas student_leads, student_lead_activities,
--   automation_message_templates
-- =============================================================

-- ----- Tenant: novos campos --------------------------------------------------
ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "automation_enabled"     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "wa_session_name"        TEXT,
  ADD COLUMN IF NOT EXISTS "wa_connected_phone"     TEXT,
  ADD COLUMN IF NOT EXISTS "wa_status"              TEXT NOT NULL DEFAULT 'DISCONNECTED',
  ADD COLUMN IF NOT EXISTS "wa_status_updated_at"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "abandoned_after_hours"  INTEGER NOT NULL DEFAULT 24;

CREATE UNIQUE INDEX IF NOT EXISTS "tenants_wa_session_name_key"
  ON "tenants"("wa_session_name");

CREATE UNIQUE INDEX IF NOT EXISTS "tenants_wa_connected_phone_key"
  ON "tenants"("wa_connected_phone");

-- ----- Enums -----------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StudentLeadStage') THEN
    CREATE TYPE "StudentLeadStage" AS ENUM (
      'NEW', 'CONTACTED', 'CHECKOUT_STARTED', 'ABANDONED', 'WON', 'LOST'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StudentLeadSource') THEN
    CREATE TYPE "StudentLeadSource" AS ENUM (
      'FORM_COURSE', 'CHECKOUT_ABANDON', 'MANUAL'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StudentLeadActivityKind') THEN
    CREATE TYPE "StudentLeadActivityKind" AS ENUM (
      'STAGE_CHANGED', 'WA_MESSAGE_SENT', 'WA_MESSAGE_FAILED',
      'NOTE', 'LEAD_CREATED', 'ENROLLMENT_LINKED', 'PAYMENT_APPROVED'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AutomationTemplateKey') THEN
    CREATE TYPE "AutomationTemplateKey" AS ENUM (
      'FORM_SUBMITTED', 'CHECKOUT_ABANDONED', 'PURCHASE_CONFIRMED', 'WELCOME'
    );
  END IF;
END $$;

-- ----- student_leads ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS "student_leads" (
  "id"               TEXT PRIMARY KEY,
  "tenant_id"        TEXT NOT NULL,
  "nome"             TEXT NOT NULL,
  "email"            TEXT NOT NULL,
  "telefone"         TEXT NOT NULL,
  "notes"            TEXT,
  "course_id"        TEXT,
  "course_snapshot"  TEXT,
  "stage"            "StudentLeadStage" NOT NULL DEFAULT 'NEW',
  "source"           "StudentLeadSource" NOT NULL DEFAULT 'FORM_COURSE',
  "enrollment_id"    TEXT,
  "student_id"       TEXT,
  "payment_value"    DECIMAL(10, 2),
  "owner_user_id"    TEXT,
  "column_order"     INTEGER NOT NULL DEFAULT 0,
  "ip_address"       TEXT,
  "user_agent"       TEXT,
  "consent_accepted" BOOLEAN NOT NULL DEFAULT FALSE,
  "consent_version"  TEXT,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "student_leads_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "student_leads_course_id_fkey"
    FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE SET NULL,
  CONSTRAINT "student_leads_enrollment_id_fkey"
    FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "student_leads_enrollment_id_key"
  ON "student_leads"("enrollment_id");

CREATE INDEX IF NOT EXISTS "student_leads_tenant_id_stage_column_order_idx"
  ON "student_leads"("tenant_id", "stage", "column_order");

CREATE INDEX IF NOT EXISTS "student_leads_tenant_id_created_at_idx"
  ON "student_leads"("tenant_id", "created_at");

CREATE INDEX IF NOT EXISTS "student_leads_tenant_id_source_idx"
  ON "student_leads"("tenant_id", "source");

CREATE INDEX IF NOT EXISTS "student_leads_course_id_idx"
  ON "student_leads"("course_id");

-- ----- student_lead_activities -----------------------------------------------
CREATE TABLE IF NOT EXISTS "student_lead_activities" (
  "id"             TEXT PRIMARY KEY,
  "lead_id"        TEXT NOT NULL,
  "kind"           "StudentLeadActivityKind" NOT NULL,
  "body"           TEXT,
  "metadata"       JSONB,
  "author_user_id" TEXT,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "student_lead_activities_lead_id_fkey"
    FOREIGN KEY ("lead_id") REFERENCES "student_leads"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "student_lead_activities_lead_id_created_at_idx"
  ON "student_lead_activities"("lead_id", "created_at");

-- ----- automation_message_templates ------------------------------------------
CREATE TABLE IF NOT EXISTS "automation_message_templates" (
  "id"         TEXT PRIMARY KEY,
  "tenant_id"  TEXT NOT NULL,
  "key"        "AutomationTemplateKey" NOT NULL,
  "body"       TEXT NOT NULL,
  "enabled"    BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "automation_message_templates_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "automation_message_templates_tenant_id_key_key"
  ON "automation_message_templates"("tenant_id", "key");
