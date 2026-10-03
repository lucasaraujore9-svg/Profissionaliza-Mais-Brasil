-- Webhooks de SAIDA (PMB -> sistemas integrados).
-- Idempotente: aplicada no build por scripts/apply-pending-migrations.mjs.
-- Sem backfill: nasce vazia. Sem endpoint cadastrado, nenhum evento sai.

CREATE TABLE IF NOT EXISTS "webhook_endpoints" (
  "id"               TEXT NOT NULL,
  "name"             TEXT NOT NULL,
  "url"              TEXT NOT NULL,
  "events"           TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "secret_encrypted" TEXT NOT NULL,
  "status"           TEXT NOT NULL DEFAULT 'ACTIVE',
  "created_by_id"    TEXT,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "webhook_endpoints_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "webhook_deliveries" (
  "id"               TEXT NOT NULL,
  "endpoint_id"      TEXT NOT NULL,
  "event"            TEXT NOT NULL,
  "payload"          JSONB NOT NULL,
  "dedupe_key"       TEXT,
  "status"           TEXT NOT NULL DEFAULT 'PENDING',
  "attempts"         INTEGER NOT NULL DEFAULT 0,
  "next_attempt_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "locked_until"     TIMESTAMP(3),
  "last_status_code" INTEGER,
  "last_error"       TEXT,
  "delivered_at"     TIMESTAMP(3),
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "webhook_deliveries_status_next_attempt_at_idx"
  ON "webhook_deliveries" ("status", "next_attempt_at");
-- NULL nao colide com NULL: evento sem dedupe nunca e barrado.
CREATE UNIQUE INDEX IF NOT EXISTS "webhook_deliveries_endpoint_id_dedupe_key_key"
  ON "webhook_deliveries" ("endpoint_id", "dedupe_key");
CREATE INDEX IF NOT EXISTS "webhook_deliveries_endpoint_id_created_at_idx"
  ON "webhook_deliveries" ("endpoint_id", "created_at");

DO $$
BEGIN
  ALTER TABLE "webhook_endpoints"
    ADD CONSTRAINT "webhook_endpoints_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "webhook_deliveries"
    ADD CONSTRAINT "webhook_deliveries_endpoint_id_fkey"
    FOREIGN KEY ("endpoint_id") REFERENCES "webhook_endpoints"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Mesma postura das demais tabelas: RLS ligada, acesso so pelo backend
-- (service role / Prisma), nunca pelo client do Supabase.
ALTER TABLE "webhook_endpoints"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_deliveries" ENABLE ROW LEVEL SECURITY;
