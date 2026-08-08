-- =============================================================
-- Reconstroi o indice parcial de "ja pagou" e o torna re-executavel.
--
-- DOIS MOTIVOS:
--
-- 1) O PREDICADO MUDOU. `EVER_PAID_PAYMENT_WHERE` passou a aceitar tambem
--    `paid_at IS NOT NULL` — sem isso um estorno reescrevia a linha que era
--    RECEIVED e apagava o fato de que o dinheiro entrou. O Postgres so usa um
--    indice parcial quando o predicado da QUERY implica o do INDICE, entao o
--    indice antigo (sem `paid_at`) deixaria de ser usado em silencio: a
--    consulta continuaria correta, so lenta.
--
-- 2) `CREATE INDEX CONCURRENTLY IF NOT EXISTS` NAO E RE-EXECUTAVEL. Se a
--    construcao concorrente abortar (lock timeout, deadlock, statement
--    timeout), o Postgres deixa o indice com `indisvalid = false`. O runner nao
--    registra a migration, o deploy seguinte roda o arquivo de novo, o
--    `IF NOT EXISTS` encontra o indice invalido e nao faz nada — e AI a
--    migration e registrada como aplicada. Resultado permanente e silencioso:
--    indice inutilizavel pelo planner e ninguem percebe. O `DROP` incondicional
--    abaixo fecha esse buraco: limpa qualquer residuo (valido ou invalido)
--    antes de reconstruir.
--
-- Idempotente e seguro para re-execucao. CONCURRENTLY nos dois comandos para
-- nao travar escrita em `tenant_payments`; `scripts/apply-pending-migrations.mjs`
-- detecta a palavra e roda o arquivo em autocommit, fora de transacao.
--
-- ATENCAO: a lista de status e o `paid_at` abaixo espelham `EVER_PAID_STATUSES`
-- e `EVER_PAID_PAYMENT_WHERE` (src/lib/tenants/lifecycle.ts). Mudou la,
-- migration nova aqui.
-- =============================================================

DROP INDEX CONCURRENTLY IF EXISTS "tenant_payments_ever_paid_tenant_idx";

CREATE INDEX CONCURRENTLY IF NOT EXISTS "tenant_payments_ever_paid_tenant_idx"
  ON "tenant_payments" ("tenant_id")
  WHERE "status" IN ('RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH')
     OR "marked_paid_at" IS NOT NULL
     OR "paid_at" IS NOT NULL;
