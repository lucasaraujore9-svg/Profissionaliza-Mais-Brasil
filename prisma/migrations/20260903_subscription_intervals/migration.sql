-- Periodicidade da assinatura: mensal, trimestral, semestral, anual e VITALICIA.
--
-- Aditiva e idempotente. SEM backfill: as colunas nascem com DEFAULT 'MONTHLY',
-- que e exatamente o unico comportamento que existia ate aqui — nenhum plano e
-- nenhuma assinatura muda de estado ao aplicar esta migration.
--
-- LIFETIME nao e "um ciclo muito longo": e uma cobranca UNICA com acesso
-- permanente. Ver src/lib/subscriptions/interval.ts.

-- ── Enum ────────────────────────────────────────────────────────────────────
-- CREATE TYPE nao aceita IF NOT EXISTS: o bloco torna a migration re-executavel
-- (o deploy da Vercel pode reprocessar uma migration cuja build abortou).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SubscriptionInterval') THEN
    CREATE TYPE "SubscriptionInterval" AS ENUM (
      'MONTHLY',
      'QUARTERLY',
      'SEMIANNUAL',
      'ANNUAL',
      'LIFETIME'
    );
  END IF;
END
$$;

-- ── Periodicidade do PLANO (o que se vende) ─────────────────────────────────
ALTER TABLE "subscription_plans"
  ADD COLUMN IF NOT EXISTS "interval" "SubscriptionInterval" NOT NULL DEFAULT 'MONTHLY';

-- ── Periodicidade CONGELADA na assinatura (o que se cobra) ──────────────────
-- Coluna propria, e nao uma leitura do plano, pelo mesmo motivo de
-- `price_at_purchase`: editar o catalogo nao pode reescrever o contrato de quem
-- ja assinou. Sem ela, transformar um plano mensal em anual faria a renovacao
-- de TODOS os assinantes antigos passar a valer 12 meses por uma cobranca.
ALTER TABLE "student_subscriptions"
  ADD COLUMN IF NOT EXISTS "interval" "SubscriptionInterval" NOT NULL DEFAULT 'MONTHLY';

-- ── Autoria da venda direta ─────────────────────────────────────────────────
-- NULL = o proprio aluno contratou na vitrine (todo o historico ate aqui).
ALTER TABLE "student_subscriptions"
  ADD COLUMN IF NOT EXISTS "sold_by_user_id" TEXT;

-- Recorte de carteira da listagem de vendas (`ctx.scope.vendas`).
CREATE INDEX IF NOT EXISTS "student_subscriptions_tenant_id_sold_by_user_id_idx"
  ON "student_subscriptions" ("tenant_id", "sold_by_user_id");

-- ── Link de pagamento da venda direta ───────────────────────────────────────
-- Mesmo papel de `enrollments.asaas_invoice_url`: o link só é devolvido UMA vez,
-- na resposta que cria a venda. Sem a coluna, o vendedor que fechasse a aba
-- perdia o link e não havia de onde recuperá-lo.
ALTER TABLE "student_subscriptions"
  ADD COLUMN IF NOT EXISTS "checkout_url" TEXT;
