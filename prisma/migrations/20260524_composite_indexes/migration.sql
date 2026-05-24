-- =============================================================
-- Migration: Composite indexes para queries hot
-- Data: 2026-05-24
-- Idempotente (CREATE INDEX IF NOT EXISTS).
--
-- Por que:
--   Auditoria de performance identificou que dashboards do painel
--   filtram por (tenantId + status) e relatórios financeiros por
--   (tenantId + janela de data). Sem composite indexes, cada query
--   faz scan amplo dentro do tenant.
--
-- Impact estimado: 10-50x em listings/dashboards de tenants ativos.
-- =============================================================

-- Enrollments: dashboards do painel ("matrículas ativas deste tenant")
CREATE INDEX IF NOT EXISTS "enrollments_tenant_id_status_idx"
  ON "enrollments"("tenant_id", "status");

CREATE INDEX IF NOT EXISTS "enrollments_student_id_status_idx"
  ON "enrollments"("student_id", "status");

-- TenantPayment: relatórios financeiros do admin ("mensalidades em atraso por mês")
CREATE INDEX IF NOT EXISTS "tenant_payments_tenant_id_status_due_date_idx"
  ON "tenant_payments"("tenant_id", "status", "due_date");

CREATE INDEX IF NOT EXISTS "tenant_payments_tenant_id_created_at_idx"
  ON "tenant_payments"("tenant_id", "created_at");

-- Payment: financeiro do revendedor ("vendas deste tenant em X mês")
CREATE INDEX IF NOT EXISTS "payments_tenant_id_created_at_idx"
  ON "payments"("tenant_id", "created_at");

CREATE INDEX IF NOT EXISTS "payments_tenant_id_paid_at_idx"
  ON "payments"("tenant_id", "paid_at");
