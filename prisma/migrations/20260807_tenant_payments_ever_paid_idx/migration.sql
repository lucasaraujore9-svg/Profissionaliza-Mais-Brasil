-- =============================================================
-- Indice parcial para "a unidade ja pagou alguma mensalidade?"
--
-- POR QUE: `lib/tenants/lifecycle.ts` responde essa pergunta com EXISTS /
-- NOT EXISTS sobre `tenant_payments`, e ela agora alimenta o churn do
-- relatorio, o KPI "Nunca ativou" e o gate de cortesia excepcional (rodado a
-- cada tentativa de reativar/tornar gratuita/adiar uma unidade).
--
-- Os indices existentes nao servem: o composto `(tenant_id, status, due_date)`
-- e derrubado pelo `OR marked_paid_at IS NOT NULL` do predicado, e o Postgres
-- cai em bitmap-OR ou seq scan.
--
-- ATENCAO — a lista de status abaixo espelha `EVER_PAID_STATUSES`
-- (src/lib/tenants/lifecycle.ts). O Postgres so usa um indice parcial quando o
-- predicado da QUERY implica o do INDICE; se um status novo entrar la sem
-- entrar aqui, o indice para de ser usado em silencio (a query continua
-- correta, so fica lenta). Mudou la, mude aqui — com migration nova.
--
-- Idempotente (IF NOT EXISTS) e sem backfill: e so um indice.
-- CONCURRENTLY para nao travar escrita em `tenant_payments` durante o deploy —
-- `scripts/apply-pending-migrations.mjs` detecta a palavra e roda o arquivo em
-- autocommit, fora de transacao.
-- =============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS "tenant_payments_ever_paid_tenant_idx"
  ON "tenant_payments" ("tenant_id")
  WHERE "status" IN ('RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH')
     OR "marked_paid_at" IS NOT NULL;
