-- =============================================================
-- Migration: Modulo Automacao para o sistema mae (PMB institucional)
-- Data: 2026-05-27
-- Idempotente.
-- - Adiciona campos pmb_automation_* / pmb_wa_* em system_settings
-- - Torna tenant_id nullable em student_leads (PMB usa NULL)
-- - Torna tenant_id nullable em automation_message_templates
-- =============================================================

ALTER TABLE "system_settings"
  ADD COLUMN IF NOT EXISTS "pmb_automation_enabled"      BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "pmb_wa_session_name"         TEXT,
  ADD COLUMN IF NOT EXISTS "pmb_wa_connected_phone"      TEXT,
  ADD COLUMN IF NOT EXISTS "pmb_wa_status"               TEXT NOT NULL DEFAULT 'DISCONNECTED',
  ADD COLUMN IF NOT EXISTS "pmb_wa_status_updated_at"    TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "pmb_abandoned_after_hours"   INTEGER NOT NULL DEFAULT 24;

CREATE UNIQUE INDEX IF NOT EXISTS "system_settings_pmb_wa_session_name_key"
  ON "system_settings"("pmb_wa_session_name");

CREATE UNIQUE INDEX IF NOT EXISTS "system_settings_pmb_wa_connected_phone_key"
  ON "system_settings"("pmb_wa_connected_phone");

-- student_leads: tornar tenant_id nullable (PMB usa NULL)
ALTER TABLE "student_leads"
  ALTER COLUMN "tenant_id" DROP NOT NULL;

-- automation_message_templates: tornar tenant_id nullable
ALTER TABLE "automation_message_templates"
  ALTER COLUMN "tenant_id" DROP NOT NULL;
