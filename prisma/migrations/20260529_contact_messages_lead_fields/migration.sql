-- Issue 068 — Caixa de atendimento (ContactMessage) + segmentacao do Lead.
-- Idempotente: seguro reaplicar (runner apply-pending-migrations.mjs exige
-- IF NOT EXISTS / DO $$ guards).

-- 1) Novas colunas estruturadas no Lead (revenda). Antes serializadas em notes.
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "plan"   TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "city"   TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "state"  VARCHAR(4);
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "source" TEXT;

-- 2) Enums do ContactMessage.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ContactMessageKind') THEN
    CREATE TYPE "ContactMessageKind" AS ENUM ('CONTACT', 'STUDENT_SUPPORT');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ContactMessageStatus') THEN
    CREATE TYPE "ContactMessageStatus" AS ENUM ('OPEN', 'RESOLVED');
  END IF;
END
$$;

-- 3) Tabela contact_messages.
CREATE TABLE IF NOT EXISTS "contact_messages" (
  "id"                  TEXT PRIMARY KEY,
  "tenant_id"           TEXT,
  "kind"                "ContactMessageKind" NOT NULL,
  "status"              "ContactMessageStatus" NOT NULL DEFAULT 'OPEN',
  "nome"                TEXT NOT NULL,
  "email"               TEXT,
  "telefone"            TEXT,
  "assunto"             TEXT,
  "mensagem"            TEXT NOT NULL,
  "student_id"          TEXT,
  "source"              TEXT,
  "ip_address"          TEXT,
  "user_agent"          TEXT,
  "resolved_at"         TIMESTAMP(3),
  "resolved_by_user_id" TEXT,
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "contact_messages_tenant_id_status_created_at_idx"
  ON "contact_messages" ("tenant_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "contact_messages_student_id_idx"
  ON "contact_messages" ("student_id");

-- 4) FKs (Tenant ON DELETE CASCADE, Student ON DELETE SET NULL).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'contact_messages_tenant_id_fkey'
  ) THEN
    ALTER TABLE "contact_messages"
      ADD CONSTRAINT "contact_messages_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'contact_messages_student_id_fkey'
  ) THEN
    ALTER TABLE "contact_messages"
      ADD CONSTRAINT "contact_messages_student_id_fkey"
      FOREIGN KEY ("student_id") REFERENCES "students"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;
