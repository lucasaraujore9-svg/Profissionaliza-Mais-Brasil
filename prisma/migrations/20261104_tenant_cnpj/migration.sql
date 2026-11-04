-- CNPJ e razao social da unidade (caso Meraki, 2026-11-04). Antes nao havia
-- onde guardar: o unico documento era o CPF de login do titular (User.cpf), e
-- o CNPJ informado no cadastro ia so para o cliente Asaas da mensalidade.
-- Aditiva, idempotente, sem backfill (null = unidade sem CNPJ informado).
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "cnpj" TEXT;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "razao_social" TEXT;
