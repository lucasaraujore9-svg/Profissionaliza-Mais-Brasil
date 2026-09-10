-- ESTORNO de mensalidade registrado manualmente.
--
-- A unidade pede cancelamento dentro do prazo de arrependimento e o dinheiro
-- volta (PIX de devolucao, estorno no painel do Asaas). O sistema precisa saber
-- disso por um motivo de dinheiro: mensalidade estornada NAO entra na comissao
-- de indicacao — a PMB nao ficou com a receita, entao nao ha o que ratear.
--
-- O comprovante e OBRIGATORIO na rota: e a prova de que o dinheiro saiu. Guarda
-- o PATH no bucket privado, nunca URL publica — mesmo padrao do comprovante de
-- saque de comissao (DB-001).
--
-- Aditiva e idempotente, sem backfill: nenhuma linha existente foi estornada.
ALTER TABLE "tenant_payments"
  ADD COLUMN IF NOT EXISTS "refunded_at" TIMESTAMP(3);
ALTER TABLE "tenant_payments"
  ADD COLUMN IF NOT EXISTS "refund_reason" TEXT;
ALTER TABLE "tenant_payments"
  ADD COLUMN IF NOT EXISTS "refund_proof_url" TEXT;
ALTER TABLE "tenant_payments"
  ADD COLUMN IF NOT EXISTS "refunded_by_id" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tenant_payments_refunded_by_id_fkey'
  ) THEN
    ALTER TABLE "tenant_payments"
      ADD CONSTRAINT "tenant_payments_refunded_by_id_fkey"
      FOREIGN KEY ("refunded_by_id") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "tenant_payments_refunded_by_id_idx"
  ON "tenant_payments" ("refunded_by_id");
