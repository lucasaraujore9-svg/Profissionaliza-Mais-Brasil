-- O Asaas como gateway de vendas deixa de ser capability liberada caso a caso
-- pelo Admin Master: TODA unidade passa a ter as duas opcoes (Mercado Pago e
-- Asaas) disponiveis no painel, bastando conectar a conta que quiser usar.
--
-- Backfill: quem estava com a capability desligada (o default de antes) passa a
-- true, e o DEFAULT da coluna vira true. O codigo desta versao ja NAO le mais
-- `asaas_gateway_enabled` — o backfill existe para a janela de deploy, em que a
-- versao ANTIGA (ainda no ar enquanto o build roda) continua lendo a coluna: com
-- true para todos, ela se comporta como o estado novo em vez de bloquear.
--
-- A coluna fica como MORTA de proposito. Dropar aqui derrubaria a versao antiga
-- (SELECT de coluna inexistente = 500 na vitrine e no checkout durante o build).
-- O DROP entra numa migration posterior, quando nenhuma versao no ar a le mais.
--
-- O backfill e deliberadamente de mao unica: reverter o commit NAO fecha a
-- capability (a coluna ja esta true), e nem precisaria — "true para todos" e o
-- estado desejado. Nao existe rollback previsto para esta migration.
-- Idempotente.
UPDATE "tenants" SET "asaas_gateway_enabled" = true WHERE "asaas_gateway_enabled" = false;
ALTER TABLE "tenants" ALTER COLUMN "asaas_gateway_enabled" SET DEFAULT true;

-- Reconciliacao das linhas que a revogacao pelo Admin Master (rota deletada
-- nesta mesma mudanca) deixava inconsistentes: ela zerava `asaas_connected` mas
-- PRESERVAVA as credenciais cifradas. Como `asaas_connected` virou a unica
-- condicao do gateway Asaas, essas unidades ficariam com a conta conectada no
-- banco e "Nao conectado" no painel — mandadas reconectar uma conta que ja
-- tinham, sem nenhuma tela no admin capaz de consertar a linha. Hoje sao 0 em
-- producao; a linha existe para a janela ate o deploy, em que a rota antiga
-- ainda no ar pode criar uma.
UPDATE "tenants" SET "asaas_connected" = true
WHERE "asaas_api_key" IS NOT NULL AND "asaas_connected" = false;
