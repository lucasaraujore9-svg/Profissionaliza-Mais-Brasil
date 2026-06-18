-- =============================================================
-- Migration: Motor de comissao de indicacao por faixas (configuravel)
--
-- Coexiste com o motor legado (% por mensalidade, por pagamento). Adiciona:
--   1) Enums: CommissionMode / CommissionBracketBasis / CommissionRateType /
--      CommissionPayoutBase.
--   2) system_settings: regra global (mode/basis/rateType/payoutBase/brackets).
--   3) tenants: override por unidade (todos NULL = herda o global).
--   4) referral_monthly_commissions: ledger do modo MONTHLY_TIERED
--      (1 linha por indicador por mes, idempotente em (referrer, period)),
--      liquidado via referral_payouts (mesmo fluxo de comprovante/baixa).
--
-- Idempotente (roda como 1 transacao no apply-pending).
-- =============================================================

-- 1) Enums (CREATE TYPE nao tem IF NOT EXISTS -> guarda por pg_type).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CommissionMode') THEN
    CREATE TYPE "CommissionMode" AS ENUM ('PER_PAYMENT_PERCENT', 'MONTHLY_TIERED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CommissionBracketBasis') THEN
    CREATE TYPE "CommissionBracketBasis" AS ENUM ('NEW_REFERRALS_MONTH', 'ACTIVE_UNITS');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CommissionRateType') THEN
    CREATE TYPE "CommissionRateType" AS ENUM ('FIXED', 'PERCENT');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CommissionPayoutBase') THEN
    CREATE TYPE "CommissionPayoutBase" AS ENUM ('ALL_ACTIVE', 'REFERRED_THIS_MONTH');
  END IF;
END $$;

-- 2) Regra global em system_settings (NOT NULL com default que preserva o legado).
ALTER TABLE "system_settings" ADD COLUMN IF NOT EXISTS "commission_mode" "CommissionMode" NOT NULL DEFAULT 'PER_PAYMENT_PERCENT';
ALTER TABLE "system_settings" ADD COLUMN IF NOT EXISTS "commission_bracket_basis" "CommissionBracketBasis" NOT NULL DEFAULT 'NEW_REFERRALS_MONTH';
ALTER TABLE "system_settings" ADD COLUMN IF NOT EXISTS "commission_rate_type" "CommissionRateType" NOT NULL DEFAULT 'FIXED';
ALTER TABLE "system_settings" ADD COLUMN IF NOT EXISTS "commission_payout_base" "CommissionPayoutBase" NOT NULL DEFAULT 'ALL_ACTIVE';
ALTER TABLE "system_settings" ADD COLUMN IF NOT EXISTS "commission_brackets" JSONB;

-- 3) Override por unidade em tenants (NULL = herda o global).
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "commission_mode" "CommissionMode";
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "commission_bracket_basis" "CommissionBracketBasis";
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "commission_rate_type" "CommissionRateType";
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "commission_payout_base" "CommissionPayoutBase";
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "commission_brackets" JSONB;

-- 4) Ledger mensal do motor MONTHLY_TIERED.
CREATE TABLE IF NOT EXISTS "referral_monthly_commissions" (
  "id" TEXT NOT NULL,
  "referrer_tenant_id" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "mode" "CommissionMode" NOT NULL,
  "bracket_basis" "CommissionBracketBasis" NOT NULL,
  "rate_type" "CommissionRateType" NOT NULL,
  "payout_base" "CommissionPayoutBase" NOT NULL,
  "bracket_index" INTEGER NOT NULL,
  "bracket_count" INTEGER NOT NULL,
  "rate" DECIMAL(10,2) NOT NULL,
  "unit_count" INTEGER NOT NULL,
  "base_sum" DECIMAL(10,2) NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "lines_snapshot" JSONB,
  "status" "ReferralCommissionStatus" NOT NULL DEFAULT 'PENDING',
  "available_at" TIMESTAMP(3) NOT NULL,
  "paid_at" TIMESTAMP(3),
  "cancelled_at" TIMESTAMP(3),
  "cancel_reason" TEXT,
  "payout_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "referral_monthly_commissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "referral_monthly_commissions_referrer_tenant_id_period_key"
  ON "referral_monthly_commissions"("referrer_tenant_id", "period");
CREATE INDEX IF NOT EXISTS "referral_monthly_commissions_referrer_tenant_id_status_idx"
  ON "referral_monthly_commissions"("referrer_tenant_id", "status");
CREATE INDEX IF NOT EXISTS "referral_monthly_commissions_status_available_at_idx"
  ON "referral_monthly_commissions"("status", "available_at");
CREATE INDEX IF NOT EXISTS "referral_monthly_commissions_payout_id_idx"
  ON "referral_monthly_commissions"("payout_id");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'referral_monthly_commissions_referrer_tenant_id_fkey'
  ) THEN
    ALTER TABLE "referral_monthly_commissions"
      ADD CONSTRAINT "referral_monthly_commissions_referrer_tenant_id_fkey"
      FOREIGN KEY ("referrer_tenant_id") REFERENCES "tenants"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'referral_monthly_commissions_payout_id_fkey'
  ) THEN
    ALTER TABLE "referral_monthly_commissions"
      ADD CONSTRAINT "referral_monthly_commissions_payout_id_fkey"
      FOREIGN KEY ("payout_id") REFERENCES "referral_payouts"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 5) Clamp referral_payout_day <= 20. A validacao da API foi estreitada de 28
-- para 20 (availableAt > dia 20 so liberaria no cron do mes seguinte). Sem este
-- clamp, uma linha existente com 21..28 faria qualquer save das configuracoes de
-- indicacao retornar 400 (o form reenvia o valor atual). Idempotente.
UPDATE "system_settings" SET "referral_payout_day" = 20 WHERE "referral_payout_day" > 20;
