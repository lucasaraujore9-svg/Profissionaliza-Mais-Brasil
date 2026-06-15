-- Asaas como gateway de vendas PROPRIO da unidade (revendedor recebe dos alunos
-- pela conta Asaas dele). Espelha o par mp_access_token/mp_webhook_secret.
--
-- NAO confundir com as colunas asaas_customer_id / asaas_subscription_id ja
-- existentes em "tenants": aquelas sao a unidade pagando a mensalidade DELA para
-- a PMB. Estas novas sao a unidade RECEBENDO dos alunos pela conta Asaas dela.
--
-- asaas_gateway_enabled: capability liberada pelo Admin Master (default false).
--   Sem ela, a config Asaas nem aparece no painel da unidade.
-- asaas_api_key / asaas_webhook_token: criptografados em AES-256 (lib/crypto).
-- asaas_connected: a unidade ja informou a API key.
-- sales_gateway: gateway ativo da vitrine (MP padrao | ASAAS).
--
-- Todas as colunas sao aditivas, nullable ou com default — sem impacto em linhas
-- existentes. Idempotente (ADD COLUMN IF NOT EXISTS) para o runner de deploy.
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "asaas_gateway_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "asaas_api_key" TEXT;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "asaas_webhook_token" TEXT;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "asaas_connected" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "sales_gateway" "PaymentGateway" NOT NULL DEFAULT 'MP';
