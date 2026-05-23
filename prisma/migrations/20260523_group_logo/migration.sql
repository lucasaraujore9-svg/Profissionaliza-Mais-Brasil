-- =============================================================
-- Migration: Logo do Grupo Bolsa Mais Brasil em todos os certificados
-- Data: 2026-05-23
-- Idempotente.
-- =============================================================

ALTER TABLE "system_settings"
  ADD COLUMN IF NOT EXISTS "group_logo_url" TEXT,
  ADD COLUMN IF NOT EXISTS "group_name"     TEXT NOT NULL DEFAULT 'Grupo Bolsa Mais Brasil';
