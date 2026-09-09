-- Antecipacao da lista de pagamento de comissoes de indicacao.
--
-- A lista passa a ser montada no fechamento do mes (dia 1) com as comissoes que
-- so serao LIBERADAS no dia X — assim o financeiro ve o valor com antecedencia
-- e pode pagar antes da data. `due_at` guarda essa data prevista de liberacao
-- (a maior `available_at` entre as comissoes do payout); sem ela nao daria para
-- distinguir, na tela, um pagamento que vence dia 20 de um que ja venceu.
--
-- Aditiva e idempotente. SEM backfill: os payouts existentes ficam com NULL, que
-- e a leitura correta para eles — todos nasceram no dia da liberacao, quando a
-- data prevista ja era o proprio dia da criacao.
ALTER TABLE "referral_payouts"
  ADD COLUMN IF NOT EXISTS "due_at" TIMESTAMP(3);
