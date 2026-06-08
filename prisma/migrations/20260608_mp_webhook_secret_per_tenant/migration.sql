-- Assinatura secreta do webhook MP por revendedor.
-- No Mercado Pago a secret de validacao do webhook (x-signature) e gerada por
-- aplicacao/conta. Como cada unidade conecta a propria conta MP, cada uma tem
-- a sua secret. Armazenada criptografada (AES-256), igual ao mp_access_token.
-- A vitrine PMB (tenantId=null) continua usando a env global MP_WEBHOOK_SECRET.
-- Aditivo e nullable: nenhum impacto em linhas existentes.
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "mp_webhook_secret" TEXT;
