-- =============================================================
-- Migration: Unidade Tecnica (link externo para escola tecnica)
-- Data: 2026-05-26
-- Idempotente.
-- Habilitado pelo admin por revendedor (tenants.tecnica_*) ou globalmente
-- para o site PMB institucional (system_settings.tecnica_*).
-- =============================================================

ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "tecnica_enabled" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "tecnica_url"     TEXT,
  ADD COLUMN IF NOT EXISTS "tecnica_label"   TEXT;

ALTER TABLE "system_settings"
  ADD COLUMN IF NOT EXISTS "tecnica_enabled" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "tecnica_url"     TEXT,
  ADD COLUMN IF NOT EXISTS "tecnica_label"   TEXT;
