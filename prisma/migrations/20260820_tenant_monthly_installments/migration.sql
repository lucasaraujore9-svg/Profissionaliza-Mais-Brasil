-- Parcelamento no cartao de QUALQUER mensalidade da unidade, nao so da primeira.
--
-- Ate aqui o parcelamento so aparecia enquanto a unidade estava PENDING (1a
-- mensalidade), com teto em `tenants.first_payment_max_installments` — cujo
-- default e 1, ou seja, ninguem ganhava a opcao sem o admin editar unidade por
-- unidade na criacao. A unidade ja ativa com uma mensalidade em aberto so tinha
-- pagamento a vista.
--
-- Dois campos, com papeis distintos e deliberadamente separados:
--   * `first_payment_max_installments` (ja existia) segue governando a 1a
--     mensalidade, que e a negociacao de ENTRADA feita na venda da revenda.
--   * `monthly_max_installments` (novo, por unidade) governa as DEMAIS. NULL =
--     usa o padrao global `system_settings.tenant_monthly_max_installments`.
--     Nao e o mesmo numero: esticar a entrada e decisao comercial da venda;
--     parcelar uma mensalidade corrente e alivio de fluxo de caixa.
--
-- Idempotente e SEM backfill: `monthly_max_installments` nasce NULL para todas
-- as unidades e a leitura cai no padrao global (12x), entao a opcao passa a
-- existir para todo mundo sem reescrever linha nenhuma. Quem precisar de um teto
-- diferente e ajustado a mao em /admin/revendedores.

ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "monthly_max_installments" INTEGER;

ALTER TABLE "system_settings"
  ADD COLUMN IF NOT EXISTS "tenant_monthly_max_installments" INTEGER NOT NULL DEFAULT 12;

-- ── Rastro do parcelamento na linha de cobranca da unidade ──────────────────
--
-- Quando a mensalidade e parcelada no cartao, o Asaas cria um PARCELAMENTO
-- (`ins_...`) e a cobranca original da assinatura e removida. A linha em
-- `tenant_payments` passa a guardar o id do parcelamento em `asaas_payment_id`
-- — que NAO resolve em GET /payments/{id}. Sem marcar isso, a tela de cobrancas
-- oferece "Pagar agora" para uma cobranca que ja foi paga e cai em 404.
--
-- UMA linha representa o parcelamento inteiro (`amount` = valor cheio da
-- mensalidade, ja autorizado no cartao). As parcelas 2..N NAO viram linhas
-- novas: isso multiplicaria a receita no financeiro. Elas so acrescentam o id
-- da parcela em `installment_paid_ids`, cujo TAMANHO e o "3 de 6" exibido.
--
-- Por que um array de ids e nao um contador: o Asaas reentrega webhook. Um
-- contador puro somaria a mesma parcela duas vezes e a linha passaria a exibir
-- "7 de 6"; com os ids, a re-entrega e um no-op natural.
--
-- Idempotente e SEM backfill. Os parcelamentos ja existentes (feitos na 1a
-- mensalidade) continuam com as colunas NULL: nao ha como recuperar o
-- installmentCount deles sem consultar o Asaas linha a linha, e o unico efeito
-- e a linha antiga seguir sem o rotulo "parcelado".

ALTER TABLE "tenant_payments"
  ADD COLUMN IF NOT EXISTS "installment_id" TEXT,
  ADD COLUMN IF NOT EXISTS "installment_count" INTEGER,
  ADD COLUMN IF NOT EXISTS "installment_paid_ids" TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS "tenant_payments_installment_id_idx"
  ON "tenant_payments" ("installment_id");
