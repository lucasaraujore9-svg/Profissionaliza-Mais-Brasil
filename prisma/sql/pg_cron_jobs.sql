-- ============================================================================
-- Agendamento dos crons no Supabase pg_cron (fonte de verdade versionada)
-- ============================================================================
-- Por que este arquivo existe:
--   O scheduler canônico do projeto é o Supabase pg_cron (ver commit 9dca6d8 —
--   o plano Vercel Hobby só permite 2 crons diários, então vercel.json fica com
--   `crons: []`). Os jobs eram criados manualmente no banco e NÃO estavam
--   versionados no repositório (achado de auditoria M19/M20). Este arquivo
--   documenta TODOS os jobs e adiciona o novo `pmb-sweep-students-expired`.
--
-- Como aplicar (NÃO é rodado automaticamente pelo deploy — execução manual):
--   1. Supabase Dashboard → SQL Editor.
--   2. Garanta as extensões: `create extension if not exists pg_cron;`
--      e `create extension if not exists pg_net;`
--   3. Garanta que a função `app_internal.run_cron(path text)` existe (ela faz
--      o net.http_post para o endpoint com o header Authorization: Bearer
--      <CRON_SECRET>). Foi criada junto com os jobs originais (commit e04c08a).
--   4. Rode este arquivo inteiro. `cron.schedule` é idempotente por `jobname`
--      (re-executar apenas atualiza o agendamento), então é seguro rodar de novo.
--   5. Confira: `select jobname, schedule, active from cron.job order by jobname;`
-- ============================================================================

-- Sincronização de catálogo (diário 06:00 UTC = 03:00 BRT)
select cron.schedule('pmb-sync-cursos', '0 6 * * *',
  $$ select app_internal.run_cron('/api/cron/sync-cursos') $$);

-- Sincronização de progresso dos alunos (diário 07:00)
select cron.schedule('pmb-sync-progresso', '0 7 * * *',
  $$ select app_internal.run_cron('/api/cron/sync-progresso') $$);

-- Suspensão de tenants inadimplentes (a cada 6h)
select cron.schedule('pmb-sweep-tenants-overdue', '0 */6 * * *',
  $$ select app_internal.run_cron('/api/cron/sweep-tenants-overdue') $$);

-- Bloqueio de alunos inadimplentes (diário 07:00)
select cron.schedule('pmb-sweep-students-overdue', '0 7 * * *',
  $$ select app_internal.run_cron('/api/cron/sweep-students-overdue') $$);

-- Reativação de quem pagou (de hora em hora, no minuto 15)
select cron.schedule('pmb-reactivate-paid', '15 * * * *',
  $$ select app_internal.run_cron('/api/cron/reactivate-paid') $$);

-- Pagamento mensal de comissões de indicação (dia 20, 05:00)
select cron.schedule('pmb-referral-monthly-payout', '0 5 20 * *',
  $$ select app_internal.run_cron('/api/cron/referral-monthly-payout') $$);

-- Limpeza de webhook_logs antigos (mensal, dia 1, 02:00)
select cron.schedule('pmb-cleanup-webhook-logs', '0 2 1 * *',
  $$ select app_internal.run_cron('/api/cron/cleanup-webhook-logs') $$);

-- Expiração de leads abandonados (a cada 2h, no minuto 15)
select cron.schedule('pmb-sweep-abandoned-leads', '15 */2 * * *',
  $$ select app_internal.run_cron('/api/cron/sweep-abandoned-leads') $$);

-- NOVO (item 11 — prazo de permanência de 12 meses): encerra o acesso de
-- matrículas expiradas, bloqueia o aluno na plataforma e roda o funil de avisos
-- (60/30/15/2 dias antes + no dia da restrição). Rodar 1x/dia é o esperado: a
-- dedup/catch-up é feita por enrollments.access_warn_days_sent, não pelo horário.
-- 07:00 — mesmo horário do pmb-sweep-students-overdue.
select cron.schedule('pmb-sweep-students-expired', '0 7 * * *',
  $$ select app_internal.run_cron('/api/cron/sweep-students-expired') $$);

-- Limpeza de eventos de navegacao anonimos (VisitorEvent sem lead) > 90 dias.
-- Eventos ja vinculados a um lead sao preservados. Semanal (domingo, 03:30).
select cron.schedule('pmb-sweep-visitor-events', '30 3 * * 0',
  $$ select app_internal.run_cron('/api/cron/sweep-visitor-events') $$);
