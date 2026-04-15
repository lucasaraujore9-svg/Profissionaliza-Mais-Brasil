CREATE TABLE IF NOT EXISTS "tenant_support_notes" (
  "id" TEXT PRIMARY KEY,
  "tenant_id" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "author_id" TEXT NOT NULL REFERENCES "users"("id"),
  "body" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "tenant_support_notes_tenant_id_created_at_idx" ON "tenant_support_notes" ("tenant_id", "created_at");
CREATE INDEX IF NOT EXISTS "tenants_account_manager_id_idx" ON "tenants" ("account_manager_id");
