-- =============================================================
-- Migration: redes sociais TikTok e YouTube por unidade (revenda)
-- Data: 2026-06-30
-- Idempotente.
--
-- Acrescenta as colunas de perfil TikTok/YouTube ao tenant, ao lado das ja
-- existentes instagram/facebook. Exibidas no rodape da vitrine do revendedor
-- (FooterMain). O perfil do site PMB (sistema mae) continua vindo de
-- branding.ts (Instagram/Facebook fixos + YouTube/TikTok por env).
-- =============================================================

ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "youtube" TEXT;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "tiktok"  TEXT;
