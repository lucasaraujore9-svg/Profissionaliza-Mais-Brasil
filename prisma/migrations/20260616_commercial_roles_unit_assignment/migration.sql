-- =============================================================
-- Migration: Estrutura comercial — papeis + atribuicao por unidade + leads B2B
-- Idempotente. Aditiva (nenhuma coluna/constraint removida).
--
-- 1) Novos papeis em UserRole:
--      PMB_SALES_MGR     -> gerente de vendas (chefia dos vendedores de revenda)
--      PMB_REVENDA_SALES -> vendedor de revenda (B2B)
--    (PMB_SALES segue = vendedor de curso; PMB_RESELLER_MGR = suporte/unidades)
-- 2) users.sales_manager_id  -> hierarquia (vendedor de revenda -> gerente)
-- 3) tenants.sales_user_id   -> vendedor de revenda atribuido a unidade
--                               (account_manager_id ja existe = gerente suporte)
-- 4) leads.owner_user_id     -> dono do lead B2B + leads.column_order (kanban)
-- 5) system_settings.lead_revenda_auto_assign / _cursor -> rodizio configuravel
--
-- ALTER TYPE ... ADD VALUE roda dentro do BEGIN/COMMIT do apply script (PG 12+).
-- Os valores novos NAO sao usados nesta mesma migration, entao nao ha restricao
-- de "uso antes do commit". Precedente: 20260430_student_auth_fields.
-- =============================================================

ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'PMB_SALES_MGR';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'PMB_REVENDA_SALES';

-- Colunas -----------------------------------------------------
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "sales_manager_id" TEXT;

ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "sales_user_id" TEXT;

ALTER TABLE "leads"
  ADD COLUMN IF NOT EXISTS "owner_user_id" TEXT;
ALTER TABLE "leads"
  ADD COLUMN IF NOT EXISTS "column_order" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "system_settings"
  ADD COLUMN IF NOT EXISTS "lead_revenda_auto_assign" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "system_settings"
  ADD COLUMN IF NOT EXISTS "lead_revenda_assign_cursor" INTEGER NOT NULL DEFAULT 0;

-- Foreign keys (ON DELETE SET NULL: remover um vendedor/gerente nao apaga a
-- unidade/lead, apenas desatribui) -----------------------------
DO $$ BEGIN
  ALTER TABLE "users" ADD CONSTRAINT "users_sales_manager_id_fkey"
    FOREIGN KEY ("sales_manager_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "tenants" ADD CONSTRAINT "tenants_sales_user_id_fkey"
    FOREIGN KEY ("sales_user_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "leads" ADD CONSTRAINT "leads_owner_user_id_fkey"
    FOREIGN KEY ("owner_user_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Indices -----------------------------------------------------
CREATE INDEX IF NOT EXISTS "users_sales_manager_id_idx" ON "users"("sales_manager_id");
CREATE INDEX IF NOT EXISTS "tenants_sales_user_id_idx" ON "tenants"("sales_user_id");
CREATE INDEX IF NOT EXISTS "leads_owner_user_id_idx" ON "leads"("owner_user_id");
CREATE INDEX IF NOT EXISTS "leads_status_column_order_idx" ON "leads"("status", "column_order");
