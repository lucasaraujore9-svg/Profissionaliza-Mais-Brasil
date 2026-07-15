-- Cap individual de desconto (%) do vendedor PMB_SALES nas vendas diretas da
-- vitrine PMB. NULL = usa o padrao da role (50). Idempotente.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "max_discount" INTEGER;
