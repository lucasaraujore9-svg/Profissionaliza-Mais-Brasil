-- Venda parcelada no boleto (carne): novo valor do enum PaymentType.
-- ISOLADO numa migration propria porque o Postgres nao permite USAR um valor de
-- enum recem-adicionado no mesmo arquivo/transacao ("unsafe use of new value").
-- A migration que cria a tabela/colunas vem em 20260707_boleto_installment_plan.
ALTER TYPE "PaymentType" ADD VALUE IF NOT EXISTS 'BOLETO_INSTALLMENT';
