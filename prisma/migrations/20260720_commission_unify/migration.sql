-- Unificacao da regra de comissao de indicacao num motor unico (MONTHLY_TIERED).
--
-- Ate aqui havia duas fontes concorrentes para o mesmo numero:
--   (A) legado: tenants.referral_percent / referral_tiers, lidos do tenant INDICADO
--   (B) faixas: tenants.commission_*, lidos do tenant INDICADOR
-- As duas eram editaveis em cards diferentes da MESMA tela e gravavam a mesma
-- coluna por caminhos diferentes.
--
-- POR QUE AS REGRAS SAO ESCRITAS EXPLICITAMENTE, E NAO TRADUZIDAS:
-- a primeira versao desta migration derivava a regra de cada indicador a partir
-- de `referral_percent`. Isso se provou ERRADO: a CARREIRA DIGITAL tinha 50%
-- gravado ali, mas o contrato real dela nunca foi percentual — e valor FIXO por
-- faixa (R$ 75/85/100 por unidade). O campo legado guardava um numero que nunca
-- refletiu acordo nenhum, justamente porque ninguem conseguia ve-lo em vigor.
-- Traduzi-lo automaticamente teria carimbado o dado errado como se fosse regra.
-- Por isso: os contratos conhecidos entram um a um, conferidos com o dono.
--
-- Idempotente: aplicada automaticamente no build por
-- scripts/apply-pending-migrations.mjs e segura para re-execucao.
--
-- Ver tambem 20260721_commission_unified_since: e ela que impede o motor unico
-- de reapurar competencias que ja foram liquidadas pelo ledger legado.

-- ---------------------------------------------------------------------------
-- 1. Regra GLOBAL (system_settings) — o padrao de quem nao tem contrato proprio
-- ---------------------------------------------------------------------------
-- Estado encontrado em producao: mode PER_PAYMENT_PERCENT + rate_type FIXED +
-- brackets [{"upTo":10,"value":0}] — faixas DEGENERADAS, que pagariam R$ 0 por
-- unidade. O percentual que de fato valia estava em default_referral_percent.
--
-- Guarda: so reescreve quando as faixas globais estao ausentes ou zeradas. Uma
-- regra global configurada de proposito (qualquer faixa com valor > 0) fica
-- intacta.
UPDATE "system_settings" s
SET
  "commission_mode" = 'MONTHLY_TIERED',
  "commission_rate_type" = 'PERCENT',
  "commission_bracket_basis" = 'ACTIVE_UNITS',
  "commission_payout_base" = 'ALL_ACTIVE',
  "commission_brackets" = jsonb_build_array(
    jsonb_build_object('upTo', NULL, 'value', COALESCE(s."default_referral_percent", 10))
  )
WHERE s."commission_plan" IS NULL
  AND (
    s."commission_brackets" IS NULL
    OR jsonb_typeof(s."commission_brackets"::jsonb) <> 'array'
    OR NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(s."commission_brackets"::jsonb) AS b
      WHERE COALESCE((b ->> 'value')::numeric, 0) > 0
    )
  );

-- ---------------------------------------------------------------------------
-- 2. CARREIRA DIGITAL ACADEMY — valor FIXO por faixa
-- ---------------------------------------------------------------------------
-- Contrato (confirmado pelo dono em 2026-07-21):
--   O GATILHO e o volume de vendas ATIVADAS no mes; o VALOR incide sobre a
--   carteira ativa inteira.
--     ate 10 ativacoes no mes ........ R$  75 por revenda ativa
--     de 11 a 25 ativacoes no mes .... R$  85 por revenda ativa
--     26 ou mais ativacoes no mes .... R$ 100 por revenda ativa
--
-- Sao dois eixos independentes, e por isso duas colunas:
--   `bracket_basis = NEW_REFERRALS_MONTH` -> escolhe a FAIXA pelas ativacoes do mes;
--   `payout_base   = ALL_ACTIVE`          -> aplica o valor a TODA a carteira ativa.
-- Uma revenda ativa que nao ativou ninguem no mes continua rendendo (a faixa e
-- que cai para a de entrada). Como o inadimplente vira SUSPENDED, "ativa" ja
-- significa "ativa e adimplente".
--
-- `resolveBracket` escolhe a 1a faixa cujo `upTo >= contagem`, entao
-- [10 -> 75, 25 -> 85, sem teto -> 100] reproduz a tabela acima exatamente.
UPDATE "tenants"
SET
  "commission_mode" = 'MONTHLY_TIERED',
  "commission_rate_type" = 'FIXED',
  "commission_bracket_basis" = 'NEW_REFERRALS_MONTH',
  "commission_payout_base" = 'ALL_ACTIVE',
  "commission_brackets" = jsonb_build_array(
    jsonb_build_object('upTo', 10,   'value', 75),
    jsonb_build_object('upTo', 25,   'value', 85),
    jsonb_build_object('upTo', NULL, 'value', 100)
  ),
  "commission_plan" = NULL,
  "commission_override_source" = 'MANUAL',
  -- O 50% legado nunca foi o acordo desta unidade. Some para nao voltar a ser
  -- lido como contrato por quem abrir a tabela daqui a seis meses; o historico
  -- do que estava gravado vive no git e nas notas dos saques.
  "referral_percent" = NULL,
  "referral_tiers" = NULL
WHERE "slug" = 'carreiradigitalacademy'
  AND "commission_brackets" IS NULL;

-- ---------------------------------------------------------------------------
-- 3. INOVASUL EDUCACIONAL — percentual com 1o mes promocional
-- ---------------------------------------------------------------------------
-- Contrato (confirmado pelo dono em 2026-07-20): 1o mes de cada unidade
-- indicada a 50%, dai em diante 15%. Corrobora o saque de 2026-06 pago a mao
-- (R$ 119,50 = 50% de R$ 239 na 1a mensalidade da BE Educacional).
--
-- O relogio das fases e o de CADA unidade indicada (activated_at dela), nao o do
-- indicador — ver resolvePhase/monthsInProgram em src/lib/referrals/.
UPDATE "tenants"
SET
  "commission_mode" = 'MONTHLY_TIERED',
  "commission_rate_type" = 'PERCENT',
  "commission_bracket_basis" = 'ACTIVE_UNITS',
  "commission_payout_base" = 'ALL_ACTIVE',
  "commission_brackets" = jsonb_build_array(
    jsonb_build_object('upTo', NULL, 'value', 15)
  ),
  "commission_plan" = jsonb_build_object(
    'phases', jsonb_build_array(
      jsonb_build_object(
        'durationMonths', 1,
        'rateType', 'PERCENT',
        'bracketBasis', 'ACTIVE_UNITS',
        'payoutBase', 'ALL_ACTIVE',
        'brackets', jsonb_build_array(jsonb_build_object('upTo', NULL, 'value', 50))
      ),
      jsonb_build_object(
        'durationMonths', NULL,
        'rateType', 'PERCENT',
        'bracketBasis', 'ACTIVE_UNITS',
        'payoutBase', 'ALL_ACTIVE',
        'brackets', jsonb_build_array(jsonb_build_object('upTo', NULL, 'value', 15))
      )
    )
  ),
  "commission_override_source" = 'MANUAL',
  -- A escala legada (`[{untilMonth:1, percent:50}]` + 15% fixo) era ambigua: sem
  -- faixa final, o codigo repetia os 50% para sempre e os 15% eram letra morta.
  -- O plano acima e a leitura que o dono confirmou; o legado sai para nao restar
  -- duas versoes da mesma regra.
  "referral_percent" = NULL,
  "referral_tiers" = NULL
WHERE "slug" = 'inovasuleducacional'
  AND "commission_plan" IS NULL;

-- ---------------------------------------------------------------------------
-- 4. Aposenta o modo legado nas linhas que sobraram
-- ---------------------------------------------------------------------------
-- O motor ja ignora commission_mode (todo indicador e apurado no fechamento
-- mensal), mas deixar 'PER_PAYMENT_PERCENT' gravado faria qualquer auditoria
-- futura ler o estado errado.
UPDATE "tenants"
SET "commission_mode" = 'MONTHLY_TIERED'
WHERE "commission_mode" = 'PER_PAYMENT_PERCENT';

UPDATE "system_settings"
SET "commission_mode" = 'MONTHLY_TIERED'
WHERE "commission_mode" = 'PER_PAYMENT_PERCENT';
