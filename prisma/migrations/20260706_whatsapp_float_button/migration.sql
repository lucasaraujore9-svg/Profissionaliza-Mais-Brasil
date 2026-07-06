-- =============================================================
-- Migration: botão flutuante de WhatsApp na vitrine (por unidade)
-- Data: 2026-07-06
-- Idempotente.
--
-- Botão flutuante opcional na vitrine do revendedor. A unidade escolhe, na aba
-- "Personalização" (menu Vitrine), se exibe o botão, de que lado (direita ou
-- esquerda) e qual mensagem já vem pré-preenchida ao abrir a conversa. O número
-- reaproveita a coluna `whatsapp` já existente; aqui só entram as preferências
-- de exibição do FAB.
-- =============================================================

ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "whatsapp_float_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "whatsapp_float_side"    TEXT    NOT NULL DEFAULT 'right';
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "whatsapp_float_message" TEXT;
