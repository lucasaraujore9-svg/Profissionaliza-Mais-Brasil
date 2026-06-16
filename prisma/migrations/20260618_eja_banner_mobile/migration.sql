-- =============================================================
-- Migration: imagem mobile do banner EJA
-- Data: 2026-06-18
-- Idempotente. O banner EJA passa a ter duas imagens padronizadas (desktop +
-- mobile). A coluna desktop (eja_banner_image_url) já existe da migration
-- 20260617_eja_idiomas_home.
-- =============================================================

ALTER TABLE "system_settings"
  ADD COLUMN IF NOT EXISTS "eja_banner_image_url_mobile" TEXT;
