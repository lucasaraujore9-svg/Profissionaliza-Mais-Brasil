-- Lead.referrerTenantId: revendedor que indicou o interessado.
-- Capturado do ?ref na pagina /seja-revendedor (ou do cookie pmb_referral) e
-- preservado na conversao do lead em revenda, atribuindo a comissao ao dono da
-- vitrine mesmo quando a equipe finaliza o cadastro.
-- Idempotente (rodada via scripts/apply-pending-migrations.mjs no build).

ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "referrer_tenant_id" TEXT;

CREATE INDEX IF NOT EXISTS "leads_referrer_tenant_id_idx"
  ON "leads" ("referrer_tenant_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_referrer_tenant_id_fkey'
  ) THEN
    ALTER TABLE "leads"
      ADD CONSTRAINT "leads_referrer_tenant_id_fkey"
      FOREIGN KEY ("referrer_tenant_id") REFERENCES "tenants" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
