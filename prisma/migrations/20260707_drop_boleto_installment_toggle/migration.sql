-- Reverte os toggles próprios do carnê: por decisão do dono, a venda parcelada no
-- boleto usa a MESMA capability de "Pagamento parcelado (mensalidade)"
-- (monthly_allowed/monthly_enabled/monthly_scope), sem campo separado. As 3
-- colunas foram adicionadas em 20260707_boleto_installment_plan e agora saem.
-- Idempotente. Roda depois daquela (drop_* > boleto_installment_plan alfabético).
ALTER TABLE "tenants" DROP COLUMN IF EXISTS "boleto_installment_allowed";
ALTER TABLE "tenants" DROP COLUMN IF EXISTS "boleto_installment_enabled";
ALTER TABLE "tenants" DROP COLUMN IF EXISTS "boleto_installment_max_count";
