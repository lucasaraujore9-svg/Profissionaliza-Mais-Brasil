-- ============================================================================
-- SAAS-006: torna audit_logs append-only (imutável) em nível de banco.
-- ============================================================================
-- Contexto:
--   A tabela audit_logs (migration 20260528_audit_logs) é a trilha forense de
--   operações sensíveis (billing, cancelamento, papéis, impersonate, conexão de
--   gateway, exportações). O wrapper logAudit só faz INSERT, mas nada impedia
--   que código futuro com acesso ao prisma client — ou a service_role no
--   Supabase — reescrevesse/apagasse registros e adulterasse a trilha (ex.:
--   billing-update + apagar o registro de auditoria correspondente).
--
-- Defesa escolhida — TRIGGER (não REVOKE):
--   Um trigger BEFORE UPDATE OR DELETE que faz RAISE EXCEPTION bloqueia toda
--   mutação vinda de QUALQUER role (inclusive o role do app e a service_role),
--   preservando o INSERT. Optamos por trigger em vez de REVOKE porque mexer nos
--   grants do role usado pela DATABASE_URL do runtime pode quebrar o app —
--   trigger é cirúrgico, portável e roda igual no Postgres self-hosted do Swarm.
--
-- Idempotente: CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS antes do
--   CREATE TRIGGER. Seguro para reaplicar (regra do runner).
-- ============================================================================

CREATE OR REPLACE FUNCTION audit_logs_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only (SAAS-006): % blocked', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$fn$;

DROP TRIGGER IF EXISTS audit_logs_no_mutation ON "audit_logs";

CREATE TRIGGER audit_logs_no_mutation
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW
  EXECUTE FUNCTION audit_logs_immutable();
