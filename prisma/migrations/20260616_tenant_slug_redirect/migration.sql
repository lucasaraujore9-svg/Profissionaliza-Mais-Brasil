-- Subdominios antigos de uma revenda apos um rename de slug.
--
-- Quando o admin (SUPER_ADMIN) ou o gerente de revendedores (PMB_RESELLER_MGR)
-- troca o subdominio de uma unidade, o slug antigo:
--   (1) passa a redirecionar (308) para o slug atual da unidade no proxy/edge; e
--   (2) fica indisponivel para outras revendas ate `expires_at` (15 dias).
-- Passado `expires_at`, a linha e ignorada (pode ser apagada por cron de higiene)
-- e o slug volta a ficar livre.
--
-- Guardamos `tenant_id` (nao o slug novo): o alvo do redirect e sempre o slug
-- atual da unidade, o que trata renames encadeados (A->B->C: A redireciona p/ C).
--
-- Idempotente (CREATE ... IF NOT EXISTS) para o runner de deploy
-- (scripts/apply-pending-migrations.mjs).

CREATE TABLE IF NOT EXISTS "tenant_slug_redirects" (
  "id"         TEXT NOT NULL,
  "old_slug"   TEXT NOT NULL,
  "tenant_id"  TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tenant_slug_redirects_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "tenant_slug_redirects_old_slug_key"
  ON "tenant_slug_redirects" ("old_slug");

CREATE INDEX IF NOT EXISTS "tenant_slug_redirects_tenant_id_idx"
  ON "tenant_slug_redirects" ("tenant_id");

CREATE INDEX IF NOT EXISTS "tenant_slug_redirects_expires_at_idx"
  ON "tenant_slug_redirects" ("expires_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tenant_slug_redirects_tenant_id_fkey'
  ) THEN
    ALTER TABLE "tenant_slug_redirects"
      ADD CONSTRAINT "tenant_slug_redirects_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
