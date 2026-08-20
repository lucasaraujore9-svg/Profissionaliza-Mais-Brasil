-- Assinaturas de aluno: acesso recorrente a um CONJUNTO de cursos enquanto a
-- mensalidade e paga.
--
-- Por que nao reusar PaymentType.MONTHLY: aquilo e um PARCELADO mensal com fim
-- programado (`maxPayments` no Asaas, `end_date` no MP). Ao atingir o total a
-- matricula vira COMPLETED e nada recria — nao existe renovacao. Assinatura
-- renova ate ser cancelada, entao precisa de entidade propria.
--
-- Distribuicao segue CoursePackage: plano com tenant_id NULL e da PMB e aparece
-- em TODAS as vitrines (atuais e futuras); a revenda so ajusta preco e
-- visibilidade em tenant_subscription_plans.
--
-- Aditiva e idempotente. SEM backfill: nenhuma matricula existente ganha
-- `student_subscription_id`, e nenhum plano nasce — o catalogo e montado a mao
-- em /admin/assinaturas.

-- ── Enums ───────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SubscriptionScope') THEN
    CREATE TYPE "SubscriptionScope" AS ENUM ('ALL', 'CATEGORY', 'PACKAGE', 'COURSES');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SubscriptionStatus') THEN
    CREATE TYPE "SubscriptionStatus" AS ENUM ('PENDING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED');
  END IF;
END $$;

-- ── Planos ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "subscription_plans" (
  "id"                 TEXT PRIMARY KEY,
  "tenant_id"          TEXT REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name"               TEXT NOT NULL,
  "slug"               TEXT NOT NULL,
  "description"        TEXT,
  "cover_image_url"    TEXT,
  "price"              DECIMAL(10,2) NOT NULL,
  "scope"              "SubscriptionScope" NOT NULL DEFAULT 'ALL',
  "category_ids"       TEXT[] NOT NULL DEFAULT '{}',
  "package_id"         TEXT REFERENCES "course_packages"("id") ON DELETE SET NULL,
  "course_ids"         TEXT[] NOT NULL DEFAULT '{}',
  "featured"           BOOLEAN NOT NULL DEFAULT false,
  "position"           INTEGER NOT NULL DEFAULT 0,
  "enabled"            BOOLEAN NOT NULL DEFAULT true,
  "created_by_user_id" TEXT,
  "created_by_role"    "UserRole",
  "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Slug unico POR vitrine. O composto e o que o @@unique([tenantId, slug]) do
-- Prisma declara — mantido IGUAL para nao gerar drift schema<->banco.
CREATE UNIQUE INDEX IF NOT EXISTS "subscription_plans_tenant_id_slug_key"
  ON "subscription_plans" ("tenant_id", "slug");

-- No Postgres dois NULLs sao distintos num unique comum, entao o composto acima
-- NAO deduplica os planos da vitrine PMB (tenant_id IS NULL): (NULL,'anual')
-- poderia entrar N vezes. Mesmo remedio de course_packages_pmb_slug_key.
DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS "subscription_plans_pmb_slug_key"
    ON "subscription_plans"("slug") WHERE "tenant_id" IS NULL;
EXCEPTION WHEN unique_violation THEN
  RAISE WARNING 'planos PMB (tenant_id IS NULL) com slug duplicado — resolva e crie subscription_plans_pmb_slug_key manualmente';
END $$;
CREATE INDEX IF NOT EXISTS "subscription_plans_tenant_id_enabled_idx"
  ON "subscription_plans" ("tenant_id", "enabled");
CREATE INDEX IF NOT EXISTS "subscription_plans_package_id_idx"
  ON "subscription_plans" ("package_id");

-- ── Override por revenda ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "tenant_subscription_plans" (
  "id"               TEXT PRIMARY KEY,
  "tenant_id"        TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "plan_id"          TEXT NOT NULL REFERENCES "subscription_plans"("id") ON DELETE CASCADE,
  "price"            DECIMAL(10,2),
  "is_visible"       BOOLEAN NOT NULL DEFAULT true,
  "is_featured"      BOOLEAN NOT NULL DEFAULT false,
  "custom_order"     INTEGER NOT NULL DEFAULT 0,
  "custom_cover_url" TEXT,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_subscription_plans_tenant_id_plan_id_key"
  ON "tenant_subscription_plans" ("tenant_id", "plan_id");
CREATE INDEX IF NOT EXISTS "tenant_subscription_plans_tenant_id_is_visible_idx"
  ON "tenant_subscription_plans" ("tenant_id", "is_visible");

-- ── Assinatura do aluno ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "student_subscriptions" (
  "id"                    TEXT PRIMARY KEY,
  "student_id"            TEXT NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "tenant_id"             TEXT REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "plan_id"               TEXT NOT NULL REFERENCES "subscription_plans"("id"),
  "status"                "SubscriptionStatus" NOT NULL DEFAULT 'PENDING',
  "price_at_purchase"     DECIMAL(10,2) NOT NULL,
  "gateway"               "PaymentGateway" NOT NULL DEFAULT 'MP',
  "billing_type"          TEXT,
  "mp_preapproval_id"     TEXT,
  "asaas_subscription_id" TEXT,
  "asaas_customer_id"     TEXT,
  "external_reference"    TEXT,
  "current_period_end"    TIMESTAMP(3),
  "started_at"            TIMESTAMP(3),
  "cancelled_at"          TIMESTAMP(3),
  "cancel_at_period_end"  BOOLEAN NOT NULL DEFAULT false,
  "coupon_id"             TEXT REFERENCES "coupons"("id"),
  "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "student_subscriptions_mp_preapproval_id_key"
  ON "student_subscriptions" ("mp_preapproval_id");
CREATE UNIQUE INDEX IF NOT EXISTS "student_subscriptions_asaas_subscription_id_key"
  ON "student_subscriptions" ("asaas_subscription_id");
CREATE INDEX IF NOT EXISTS "student_subscriptions_student_id_status_idx"
  ON "student_subscriptions" ("student_id", "status");
CREATE INDEX IF NOT EXISTS "student_subscriptions_tenant_id_status_idx"
  ON "student_subscriptions" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "student_subscriptions_status_current_period_end_idx"
  ON "student_subscriptions" ("status", "current_period_end");
CREATE INDEX IF NOT EXISTS "student_subscriptions_coupon_id_idx"
  ON "student_subscriptions" ("coupon_id");
CREATE INDEX IF NOT EXISTS "student_subscriptions_plan_id_idx"
  ON "student_subscriptions" ("plan_id");

-- ── Cobrancas do ciclo ──────────────────────────────────────────────────────
-- Tabela propria em vez de reusar `payments`: la `enrollment_id` e NOT NULL e
-- alimenta os indices do BI. Torna-lo opcional espalharia NULL por relatorios
-- que hoje assumem matricula.
CREATE TABLE IF NOT EXISTS "subscription_payments" (
  "id"               TEXT PRIMARY KEY,
  "subscription_id"  TEXT NOT NULL REFERENCES "student_subscriptions"("id") ON DELETE CASCADE,
  "tenant_id"        TEXT,
  "amount"           DECIMAL(10,2) NOT NULL,
  "gateway"          "PaymentGateway" NOT NULL,
  "mp_payment_id"    TEXT,
  "asaas_payment_id" TEXT,
  "status"           TEXT NOT NULL,
  "billing_type"     TEXT,
  "due_date"         TIMESTAMP(3) NOT NULL,
  "paid_at"          TIMESTAMP(3),
  "invoice_url"      TEXT,
  "bank_slip_url"    TEXT,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "subscription_payments_mp_payment_id_key"
  ON "subscription_payments" ("mp_payment_id");
CREATE UNIQUE INDEX IF NOT EXISTS "subscription_payments_asaas_payment_id_key"
  ON "subscription_payments" ("asaas_payment_id");
CREATE INDEX IF NOT EXISTS "subscription_payments_subscription_id_idx"
  ON "subscription_payments" ("subscription_id");
CREATE INDEX IF NOT EXISTS "subscription_payments_tenant_id_paid_at_idx"
  ON "subscription_payments" ("tenant_id", "paid_at");
CREATE INDEX IF NOT EXISTS "subscription_payments_status_due_date_idx"
  ON "subscription_payments" ("status", "due_date");

-- ── Matricula nascida de assinatura ─────────────────────────────────────────
-- NULL em toda matricula existente: compra avulsa segue exatamente como era.
ALTER TABLE "enrollments"
  ADD COLUMN IF NOT EXISTS "student_subscription_id" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'enrollments_student_subscription_id_fkey'
  ) THEN
    ALTER TABLE "enrollments"
      ADD CONSTRAINT "enrollments_student_subscription_id_fkey"
      FOREIGN KEY ("student_subscription_id")
      REFERENCES "student_subscriptions"("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "enrollments_student_subscription_id_idx"
  ON "enrollments" ("student_subscription_id");
