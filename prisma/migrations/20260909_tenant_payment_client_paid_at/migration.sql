-- COMPETENCIA da mensalidade separada do CAIXA.
--
--     competencia = max(vencimento, data em que o CLIENTE pagou)
--
-- A mensalidade pertence ao mes da FATURA; se o pagamento atrasar, ela anda para
-- o mes em que foi paga. Antecipar nao move nada. Dois casos reais motivaram as
-- duas metades: `Lira's` venceu 02/08 e pagou 30/07 (antecipou — e agosto), e
-- `otymus` venceu 31/08 e pagou 05/09 (atrasou — e setembro).
--
-- A data de pagamento e a do CLIENTE, nao a do credito: no cartao o Asaas credita
-- em D+32 e a mensalidade paga em 03/08 entrava como pagamento de 04/09. Medido
-- em producao: 43 cobrancas com as duas datas em meses diferentes, todas cartao.
--
-- `paid_at` NAO muda de significado — continua sendo CAIXA (churn, blacklist,
-- financeiro, inadimplencia). Por isso as colunas sao NOVAS, e nao um rename.
--
-- Aditiva e idempotente. O backfill abaixo e OBRIGATORIO: sem ele as colunas
-- nascem nulas e o motor de comissao leria a base inteira como "nunca pagou".
ALTER TABLE "tenant_payments"
  ADD COLUMN IF NOT EXISTS "client_paid_at" TIMESTAMP(3);
ALTER TABLE "tenant_payments"
  ADD COLUMN IF NOT EXISTS "competence_at" TIMESTAMP(3);

-- Backfill 1 — a data real do cliente, quando algum webhook a registrou.
-- `DISTINCT ON ... ORDER BY created_at DESC` pega o ultimo evento de cada
-- cobranca, que e o que carrega as datas definitivas.
WITH ultimo_evento AS (
  SELECT DISTINCT ON (payload->'payment'->>'id')
         payload->'payment'->>'id' AS asaas_payment_id,
         (payload->'payment'->>'clientPaymentDate')::timestamp AS client_paid_at
  FROM webhook_logs
  WHERE event_type IN ('PAYMENT_RECEIVED','PAYMENT_CONFIRMED')
    AND payload->'payment'->>'clientPaymentDate' IS NOT NULL
  ORDER BY payload->'payment'->>'id', created_at DESC
)
UPDATE tenant_payments tp
   SET client_paid_at = ue.client_paid_at
  FROM ultimo_evento ue
 WHERE tp.asaas_payment_id = ue.asaas_payment_id
   AND tp.client_paid_at IS DISTINCT FROM ue.client_paid_at;

-- Backfill 2 — o resto cai em `paid_at`: historico anterior aos webhooks e baixa
-- manual do financeiro (PIX por fora), que nunca teve data de cliente.
UPDATE tenant_payments
   SET client_paid_at = paid_at
 WHERE client_paid_at IS NULL
   AND paid_at IS NOT NULL;

-- Backfill 3 — a competencia propriamente dita. So para cobranca PAGA: fatura em
-- aberto sem competencia e o que impede uma cobranca nao paga contar como
-- receita do mes do vencimento.
UPDATE tenant_payments
   SET competence_at = GREATEST(due_date, client_paid_at)
 WHERE client_paid_at IS NOT NULL
   AND competence_at IS DISTINCT FROM GREATEST(due_date, client_paid_at);

-- Varredura da competencia pelo motor de comissao.
CREATE INDEX IF NOT EXISTS "tenant_payments_tenant_id_competence_at_idx"
  ON "tenant_payments" ("tenant_id", "competence_at");
