-- Modulo "Vender assinaturas" passa a nascer LIGADO, e as unidades que estavam
-- com ele desligado sao religadas (decisao do dono, 2026-10-22). Reverte o
-- default FALSE de 20260910_tenant_subscriptions_module.
--
-- O backfill so roda enquanto o default ainda e false: se a tabela de tracking
-- das migrations cair e este arquivo rodar de novo, ele NAO religa a unidade
-- que alguem desligou de proposito depois do deploy.
DO $$
BEGIN
  IF (SELECT column_default FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'tenants'
        AND column_name = 'subscriptions_enabled') = 'false' THEN
    UPDATE "tenants" SET "subscriptions_enabled" = true WHERE "subscriptions_enabled" = false;
    ALTER TABLE "tenants" ALTER COLUMN "subscriptions_enabled" SET DEFAULT true;
  END IF;
END $$;
