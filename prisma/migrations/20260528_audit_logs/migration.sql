-- Trilha de auditoria persistente (R14 / issue 117).
-- Idempotente: seguro para reaplicar (o runner apply-pending-migrations.mjs
-- exige IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id"               TEXT PRIMARY KEY,
  "action"           TEXT NOT NULL,
  "resource"         TEXT NOT NULL,
  "resource_id"      TEXT,
  "actor_user_id"    TEXT,
  "actor_student_id" TEXT,
  "actor_role"       TEXT NOT NULL,
  "actor_email"      TEXT,
  "tenant_id"        TEXT,
  "payload_before"   JSONB,
  "payload_after"    JSONB,
  "ip"               TEXT,
  "user_agent"       TEXT,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "audit_logs_actor_user_id_created_at_idx"
  ON "audit_logs" ("actor_user_id", "created_at");
CREATE INDEX IF NOT EXISTS "audit_logs_tenant_id_created_at_idx"
  ON "audit_logs" ("tenant_id", "created_at");
CREATE INDEX IF NOT EXISTS "audit_logs_resource_resource_id_idx"
  ON "audit_logs" ("resource", "resource_id");
CREATE INDEX IF NOT EXISTS "audit_logs_action_created_at_idx"
  ON "audit_logs" ("action", "created_at");
CREATE INDEX IF NOT EXISTS "audit_logs_created_at_idx"
  ON "audit_logs" ("created_at");
