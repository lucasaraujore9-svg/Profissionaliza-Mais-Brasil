-- Corte do motor unico de comissao de indicacao.
--
-- Ate junho/2026 as comissoes viveram no ledger legado (ReferralCommission) e
-- foram liquidadas de la — inclusive os dois saques pagos a mao em 20/07/2026.
-- O motor unico apura por competencia e NAO consulta o ledger legado quando o
-- payoutBase e ALL_ACTIVE (so PAID_THIS_MONTH herda o filtro anti-duplicidade).
-- Sem um corte explicito, o catch-up de 3 meses do cron reapuraria junho e
-- criaria uma SEGUNDA comissao sobre um mes que ja saiu do caixa.
--
-- '2026-07' = primeira competencia que pertence ao motor unico.
ALTER TABLE "system_settings"
  ADD COLUMN IF NOT EXISTS "commission_unified_since" TEXT;

UPDATE "system_settings"
SET "commission_unified_since" = '2026-07'
WHERE "commission_unified_since" IS NULL;
