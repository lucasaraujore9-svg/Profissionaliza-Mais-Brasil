-- Parcelamento no cartao das vendas de cursos aos alunos (Mercado Pago).
-- Adiciona o teto de parcelas SEM JUROS por unidade (Tenant) e o equivalente
-- para as vendas diretas da PMB (SystemSettings). O teto de parcelas oferecido
-- e sempre 12x (constante no codigo: MAX_CARD_INSTALLMENTS).
-- Idempotente: aplicada automaticamente no build por
-- scripts/apply-pending-migrations.mjs e segura para re-execucao.

ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "interest_free_installments" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "system_settings"
  ADD COLUMN IF NOT EXISTS "pmb_interest_free_installments" INTEGER NOT NULL DEFAULT 1;
