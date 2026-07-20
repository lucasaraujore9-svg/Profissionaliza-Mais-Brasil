-- Unificacao da regra de comissao de indicacao num motor unico (MONTHLY_TIERED).
--
-- Ate aqui havia duas fontes concorrentes para o mesmo numero:
--   (A) legado: tenants.referral_percent / referral_tiers, lidos do tenant INDICADO
--   (B) faixas: tenants.commission_*, lidos do tenant INDICADOR
-- As duas eram editaveis em cards diferentes da MESMA tela e gravavam a mesma
-- coluna por caminhos diferentes. Quem configurava 50% na pagina do indicador via
-- o sistema pagar o padrao global — o caso concreto que originou esta migracao.
--
-- Aqui traduzimos a regra legada de cada indicador para o bloco commission_*,
-- que passa a ser a UNICA fonte de verdade. Os campos legados NAO sao apagados:
-- ficam como evidencia do que valia antes (o codigo nao os le mais no calculo).
--
-- Idempotente: aplicada automaticamente no build por
-- scripts/apply-pending-migrations.mjs e segura para re-execucao.

-- ---------------------------------------------------------------------------
-- 1. Regra GLOBAL (system_settings)
-- ---------------------------------------------------------------------------
-- Estado encontrado em producao: mode PER_PAYMENT_PERCENT + rate_type FIXED +
-- brackets [{"upTo":10,"value":0}] — faixas DEGENERADAS, que pagariam R$ 0 por
-- unidade se alguem trocasse o modo. O percentual que de fato valia estava em
-- default_referral_percent. Traduzimos esse percentual para uma faixa unica
-- PERCENT sobre todas as ativas, que e o que o motor unico consome.
--
-- Guarda: so reescreve quando as faixas globais estao ausentes ou zeradas. Uma
-- regra global ja configurada de proposito (qualquer faixa com valor > 0) fica
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
-- 2. Regra POR INDICADOR (tenants)
-- ---------------------------------------------------------------------------
-- Traduz a regra legada de quem tem referral_percent e/ou referral_tiers e ainda
-- nao tem regra propria no bloco novo. Alvo: apenas tenants que SAO indicadores
-- (tem ao menos uma unidade indicada) — em qualquer outro tenant o campo legado
-- nunca teve efeito e copia-lo criaria uma regra que nunca existiu.
--
-- Semantica adotada (decidida com o dono): a regra pertence ao INDICADOR e o
-- relogio das fases pertence a cada unidade indicada. Uma escala legada
-- [{untilMonth:N, percent:P}] vira uma fase de N meses a P%, fechada por uma
-- fase final "em diante" com o percentual fixo da unidade — que e exatamente o
-- que o formulario antigo prometia ("depois disso, use este %").
UPDATE "tenants" t
SET
  "commission_mode" = 'MONTHLY_TIERED',
  "commission_rate_type" = 'PERCENT',
  "commission_bracket_basis" = 'ACTIVE_UNITS',
  "commission_payout_base" = 'ALL_ACTIVE',
  "commission_brackets" = jsonb_build_array(
    jsonb_build_object(
      'upTo', NULL,
      -- Faixa singular = o percentual "de regime". Com escala, o valor de regime
      -- e o da fase final; sem escala, o proprio referral_percent.
      'value', t."referral_percent"
    )
  ),
  "commission_plan" = CASE
    WHEN t."referral_tiers" IS NOT NULL
     AND jsonb_typeof(t."referral_tiers"::jsonb) = 'array'
     AND jsonb_array_length(t."referral_tiers"::jsonb) > 0
    THEN jsonb_build_object(
      'phases',
      (
        SELECT jsonb_agg(phase ORDER BY ord)
        FROM (
          -- Fases vindas da escala: duracao = diferenca entre tetos consecutivos
          -- (a escala legada e cumulativa "ate o mes N", o plano novo e por
          -- duracao). Faixas sem teto viram a fase final.
          SELECT
            row_number() OVER (ORDER BY (tier ->> 'untilMonth')::int) AS ord,
            jsonb_build_object(
              'durationMonths',
              (tier ->> 'untilMonth')::int
                - COALESCE(
                    lag((tier ->> 'untilMonth')::int)
                      OVER (ORDER BY (tier ->> 'untilMonth')::int),
                    0
                  ),
              'rateType', 'PERCENT',
              'bracketBasis', 'ACTIVE_UNITS',
              'payoutBase', 'ALL_ACTIVE',
              'brackets', jsonb_build_array(
                jsonb_build_object('upTo', NULL, 'value', (tier ->> 'percent')::numeric)
              )
            ) AS phase
          FROM jsonb_array_elements(t."referral_tiers"::jsonb) AS tier
          WHERE tier ->> 'untilMonth' IS NOT NULL

          UNION ALL

          -- Fase final "em diante" com o percentual fixo da unidade.
          SELECT
            1000000 AS ord,
            jsonb_build_object(
              'durationMonths', NULL,
              'rateType', 'PERCENT',
              'bracketBasis', 'ACTIVE_UNITS',
              'payoutBase', 'ALL_ACTIVE',
              'brackets', jsonb_build_array(
                jsonb_build_object('upTo', NULL, 'value', t."referral_percent")
              )
            ) AS phase
        ) AS phases_src
      )
    )
    ELSE NULL
  END,
  "commission_override_source" = 'MANUAL'
WHERE t."referral_percent" IS NOT NULL
  AND t."commission_plan" IS NULL
  AND t."commission_brackets" IS NULL
  AND EXISTS (SELECT 1 FROM "tenants" r WHERE r."referrer_tenant_id" = t."id");

-- ---------------------------------------------------------------------------
-- 3. Aposenta o modo legado nas linhas que sobraram
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
