-- Cursos de autoria da unidade + rateio bancario (split Asaas).
--
-- O catalogo era global e de dono unico (PMB): `courses` nao tinha nenhum
-- marcador de autoria e cursos so entravam por sync das fornecedoras. A unidade
-- passa a PRODUZIR curso proprio, escolher em quais vitrines ele e vendido e
-- definir a comissao de quem vender.
--
-- Aditiva e idempotente. SEM backfill: `author_tenant_id` nasce NULL em todas as
-- linhas existentes, e NULL e exatamente "curso do catalogo da PMB" — o
-- comportamento de hoje continua sendo o default do sistema.

-- ── Enums ───────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CourseDistribution') THEN
    CREATE TYPE "CourseDistribution" AS ENUM ('OWN_ONLY', 'OWN_AND_PMB', 'NETWORK');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AuthoredPricingMode') THEN
    CREATE TYPE "AuthoredPricingMode" AS ENUM ('FIXED', 'MIN_PRICE', 'MIN_PRODUCER_NET');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AuthoredCourseStatus') THEN
    CREATE TYPE "AuthoredCourseStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'PAUSED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CourseSplitRole') THEN
    CREATE TYPE "CourseSplitRole" AS ENUM ('PRODUCER', 'SELLER', 'PLATFORM');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CourseSplitStatus') THEN
    CREATE TYPE "CourseSplitStatus" AS ENUM (
      'PENDING', 'AWAITING_CREDIT', 'DONE', 'REFUSED', 'CANCELLED', 'REFUNDED', 'RETAINED'
    );
  END IF;
END $$;

-- ── Autoria no catalogo ─────────────────────────────────────────────────────
ALTER TABLE "courses"
  ADD COLUMN IF NOT EXISTS "author_tenant_id"           TEXT REFERENCES "tenants"("id") ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS "author_user_id"             TEXT,
  ADD COLUMN IF NOT EXISTS "authored_status"            "AuthoredCourseStatus",
  ADD COLUMN IF NOT EXISTS "distribution"               "CourseDistribution"  NOT NULL DEFAULT 'OWN_ONLY',
  ADD COLUMN IF NOT EXISTS "pricing_mode"               "AuthoredPricingMode" NOT NULL DEFAULT 'FIXED',
  ADD COLUMN IF NOT EXISTS "author_amount"              DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS "seller_commission_percent"  DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS "platform_fee_percent"       DECIMAL(5,2);

CREATE INDEX IF NOT EXISTS "courses_author_tenant_id_authored_status_idx"
  ON "courses" ("author_tenant_id", "authored_status");

-- O unique de nome passa a incluir o autor: duas unidades podem publicar
-- "Excel Basico" sem uma barrar a outra.
--
-- CUIDADO: o Postgres trata NULL como DISTINTO num unique composto, entao este
-- indice NAO dedupe mais o catalogo da PMB (author_tenant_id IS NULL) — sem o
-- indice parcial abaixo, o sync passaria a criar cursos PMB duplicados a cada
-- corrida em que o findFirst nao casasse.
ALTER TABLE "courses" DROP CONSTRAINT IF EXISTS "courses_provider_nome_key";
DROP INDEX IF EXISTS "courses_provider_nome_key";

CREATE UNIQUE INDEX IF NOT EXISTS "courses_provider_author_tenant_id_nome_key"
  ON "courses" ("provider", "author_tenant_id", "nome");

-- Preserva a garantia antiga onde ela importa: o catalogo da PMB.
CREATE UNIQUE INDEX IF NOT EXISTS "courses_provider_nome_pmb_key"
  ON "courses" ("provider", "nome")
  WHERE "author_tenant_id" IS NULL;

-- ── Carteira Asaas da unidade (destino do split) ────────────────────────────
ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "asaas_wallet_id"         TEXT,
  ADD COLUMN IF NOT EXISTS "asaas_wallet_checked_at" TIMESTAMP(3);

-- ── Termos congelados na matricula ──────────────────────────────────────────
ALTER TABLE "enrollments"
  ADD COLUMN IF NOT EXISTS "author_split_snapshot" JSONB;

-- ── Linhas de rateio realizadas ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "course_sale_splits" (
  "id"                    TEXT PRIMARY KEY,
  "payment_id"            TEXT NOT NULL REFERENCES "payments"("id") ON DELETE CASCADE,
  "enrollment_id"         TEXT NOT NULL,
  "course_id"             TEXT NOT NULL,
  "role"                  "CourseSplitRole" NOT NULL,
  "beneficiary_tenant_id" TEXT REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "wallet_id"             TEXT,
  "amount"                DECIMAL(10,2) NOT NULL,
  "percent_applied"       DECIMAL(7,4),
  "asaas_split_id"        TEXT,
  "status"                "CourseSplitStatus" NOT NULL DEFAULT 'PENDING',
  "refusal_reason"        TEXT,
  "settled_at"            TIMESTAMP(3),
  "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Chave de idempotencia: a re-entrega do webhook do gateway re-executa o
-- fulfill, e a segunda passada nao pode duplicar o extrato.
CREATE UNIQUE INDEX IF NOT EXISTS "course_sale_splits_payment_id_role_key"
  ON "course_sale_splits" ("payment_id", "role");

CREATE UNIQUE INDEX IF NOT EXISTS "course_sale_splits_asaas_split_id_key"
  ON "course_sale_splits" ("asaas_split_id");

CREATE INDEX IF NOT EXISTS "course_sale_splits_beneficiary_tenant_id_status_idx"
  ON "course_sale_splits" ("beneficiary_tenant_id", "status");
CREATE INDEX IF NOT EXISTS "course_sale_splits_course_id_idx"
  ON "course_sale_splits" ("course_id");
CREATE INDEX IF NOT EXISTS "course_sale_splits_enrollment_id_idx"
  ON "course_sale_splits" ("enrollment_id");
