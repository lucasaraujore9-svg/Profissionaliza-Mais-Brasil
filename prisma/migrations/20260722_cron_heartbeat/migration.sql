-- Batimento dos jobs agendados (ver model CronRun).
-- Idempotente: aplicada no build por scripts/apply-pending-migrations.mjs.
--
-- Os crons rodam no pg_cron chamando nossas rotas por HTTP. `cron.job_run_details`
-- prova que o Postgres disparou, nao que a rota rodou — foi por isso que a quebra
-- do pg_net (30/04 a 10/06 de 2026) passou seis semanas despercebida. Esta tabela
-- e a prova do lado da aplicacao.

CREATE TABLE IF NOT EXISTS "cron_runs" (
  "job_name"    TEXT NOT NULL,
  "last_run_at" TIMESTAMP(3) NOT NULL,
  "run_count"   INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "cron_runs_pkey" PRIMARY KEY ("job_name")
);
