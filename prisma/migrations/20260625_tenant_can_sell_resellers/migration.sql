-- Módulo "Revender revendas": flag por unidade. Quando true, a unidade ganha o
-- menu de venda de revendas; as revendas que ela cria são cobradas no Asaas da
-- PMB e atreladas a ela via referrer_tenant_id. Idempotente.

ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "can_sell_resellers" BOOLEAN NOT NULL DEFAULT false;
