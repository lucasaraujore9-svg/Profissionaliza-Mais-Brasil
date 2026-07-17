-- Parcelamento no cartao (vitrine PMB via Asaas /installments): novo valor do
-- enum PaymentType. ISOLADO numa migration propria porque o Postgres nao permite
-- USAR um valor de enum recem-adicionado no mesmo arquivo/transacao ("unsafe use
-- of new value"). Mesmo padrao de 20260707_boleto_installment_enum.
ALTER TYPE "PaymentType" ADD VALUE IF NOT EXISTS 'CARD_INSTALLMENT';
