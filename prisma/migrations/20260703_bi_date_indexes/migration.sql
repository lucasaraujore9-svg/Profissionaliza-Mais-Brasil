-- DB-001: o BI hub (src/lib/reports) roda agregações platform-wide sobre
-- created_at / paid_at nas 3 maiores tabelas SEM índice líder por data. Sem
-- coluna de tenant no filtro (segment pmb/revenda/todos), os índices compostos
-- [tenant_id, paid_at] / [tenant_id, created_at] não são usáveis (líder não
-- restrito) → seq scan filtrando por range de data. Estes índices ADITIVOS dão
-- ao planner um caminho por data:
--   * students / enrollments / referral_*: created_at líder (COUNT/aggregate por bucket)
--   * payments: (mp_status, paid_at) casa exatamente approvedRevenueByBucket
--     (WHERE mp_status='APPROVED' AND paid_at range GROUP BY date_trunc(paid_at))
--   * students.estado: student.groupBy({ by: estado }) em alunos-matriculas
--
-- Nomes idênticos aos defaults do Prisma (@@index correspondentes no schema)
-- para manter schema.prisma e banco em sincronia (sem drift).
--
-- Idempotente (IF NOT EXISTS). SEM CONCURRENTLY: o runner
-- (apply-pending-migrations.mjs) aplica cada migration dentro de uma transação,
-- e CREATE INDEX CONCURRENTLY não roda em transação. Em prod cheia, aplicar em
-- janela de baixo tráfego (o CREATE INDEX pega SHARE lock e bloqueia escritas
-- nessas tabelas durante a criação).

CREATE INDEX IF NOT EXISTS "students_created_at_idx" ON "students"("created_at");
CREATE INDEX IF NOT EXISTS "students_estado_idx" ON "students"("estado");
CREATE INDEX IF NOT EXISTS "enrollments_created_at_idx" ON "enrollments"("created_at");
CREATE INDEX IF NOT EXISTS "enrollments_status_created_at_idx" ON "enrollments"("status", "created_at");
CREATE INDEX IF NOT EXISTS "payments_mp_status_paid_at_idx" ON "payments"("mp_status", "paid_at");
CREATE INDEX IF NOT EXISTS "referral_commissions_created_at_idx" ON "referral_commissions"("created_at");
CREATE INDEX IF NOT EXISTS "referral_monthly_commissions_created_at_idx" ON "referral_monthly_commissions"("created_at");
