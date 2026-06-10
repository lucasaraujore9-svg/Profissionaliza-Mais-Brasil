-- ============================================================================
-- Corrige app_internal.run_cron: chamada quebrada a extensions.http_post
-- ============================================================================
-- Contexto:
--   Em 2026-04-30 (~22:15 UTC) um upgrade do Supabase moveu/reinstalou o
--   pg_net e a funcao http_post deixou de existir no schema `extensions` —
--   ela vive no schema canonico `net` (net.http_post). Como
--   app_internal.run_cron roda com `SET search_path TO ''` e referenciava
--   `extensions.http_post`, TODOS os jobs do pg_cron passaram a falhar com
--   "function extensions.http_post(...) does not exist" (1.400+ falhas em
--   cron.job_run_details entre 2026-04-30 e 2026-06-10): sync-cursos,
--   sweeps de inadimplencia, reactivate-paid, etc.
--
-- Fix: recriar a funcao apontando para net.http_post (assinatura atual:
--   url text, body jsonb, params jsonb, headers jsonb,
--   timeout_milliseconds integer). CREATE OR REPLACE = idempotente.
-- ============================================================================

CREATE OR REPLACE FUNCTION app_internal.run_cron(path text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  s app_internal.cron_settings%ROWTYPE;
  request_id BIGINT;
BEGIN
  SELECT * INTO s FROM app_internal.cron_settings WHERE id = 1;
  IF s.cron_secret = 'REPLACE_ME' OR s.cron_secret = '' THEN
    RAISE NOTICE 'cron_secret nao configurado — pulando %', path;
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url := s.app_url || path,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || s.cron_secret
    ),
    body := jsonb_build_object('source', 'pg_cron'),
    timeout_milliseconds := 60000
  ) INTO request_id;

  RETURN request_id;
END;
$fn$;
