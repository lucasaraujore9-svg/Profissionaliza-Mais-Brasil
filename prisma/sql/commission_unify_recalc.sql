-- ===========================================================================
-- RECALCULO DAS COMISSOES DE INDICACAO — passo MANUAL de producao
-- ===========================================================================
--
-- NAO e uma migration. Nao roda no build. Rode a mao (Supabase Management API)
-- DEPOIS que o deploy da unificacao estiver no ar, porque o passo 2 depende do
-- codigo novo para reapurar.
--
-- CONTEXTO
-- Ate a unificacao, a regra de comissao era lida do lado errado do par
-- (indicador, indicado) e todo mundo caia no padrao global de 10% — R$ 23,90
-- sobre uma mensalidade de R$ 239. As regras reais, confirmadas com o dono e
-- gravadas pela migration 20260720_commission_unify, sao:
--
--   CARREIRA DIGITAL ACADEMY  faixa pelas ATIVACOES do mes, valor sobre a
--                             carteira ativa inteira:
--                               ate 10 ativacoes -> R$  75 por revenda ativa
--                               11 a 25          -> R$  85 por revenda ativa
--                               26+              -> R$ 100 por revenda ativa
--   INOVASUL EDUCACIONAL      1o mes de cada indicada 50%, depois 15%
--
-- JUNHO/2026 JA ESTA LIQUIDADO E CORRETO — NAO MEXER.
-- O financeiro pagou a mao em 20/07, ajustando o valor no mark-paid:
--   CDA      R$  75,00  = 1 ativacao em junho (faixa 0-10) x 1 revenda na carteira
--   INOVASUL R$ 119,50  = 50% de R$ 239 (1a mensalidade da BE Educacional)
-- Os dois conferem com as regras acima. As comissoes de junho ficam PAID e
-- vinculadas aos saques pagos; cancela-las quebraria o vinculo com dinheiro que
-- ja saiu. Quem impede junho de ser reapurado e o corte abaixo, NAO o filtro
-- anti-duplicidade (que so vale para o payoutBase PAID_THIS_MONTH).
--
-- O QUE SOBROU ERRADO: julho/2026 da CDA. Cinco mensalidades foram comissionadas
-- a 10% (5 x R$ 23,90 = R$ 119,50). Pela regra real, julho teve 6 ativacoes
-- (faixa 0-10 -> R$ 75) e a carteira fechou com 7 revendas ativas:
-- 7 x R$ 75 = R$ 525,00. Nenhuma foi paga — liberam so em 20/08.
--
-- JUNHO NAO PODE SER REAPURADO. Com payoutBase ALL_ACTIVE o motor nao consulta
-- mais o ledger legado, entao o catch-up de 3 meses do cron criaria uma SEGUNDA
-- comissao de junho. A protecao e a migration 20260721_commission_unified_since,
-- que grava commission_unified_since = '2026-07' — confira que ela subiu ANTES
-- de rodar o passo 2.
--
-- Rode os passos NA ORDEM e confira a saida de cada um antes de seguir.

-- ---------------------------------------------------------------------------
-- PASSO 0 — Fotografia do "antes" (guarde esta saida)
-- ---------------------------------------------------------------------------
SELECT ref.slug AS indicador, ind.slug AS indicada, rc.percent, rc.amount,
       rc.status, rc.payout_id, to_char(tp.paid_at, 'YYYY-MM') AS competencia
FROM referral_commissions rc
JOIN tenants ref ON ref.id = rc.referrer_tenant_id
JOIN tenants ind ON ind.id = rc.referred_tenant_id
JOIN tenant_payments tp ON tp.id = rc.tenant_payment_id
ORDER BY ref.slug, tp.paid_at;

SELECT p.id, t.slug, p.amount, p.status, p.paid_at
FROM referral_payouts p JOIN tenants t ON t.id = p.referrer_tenant_id;

-- TRAVA DE SEGURANCA: o passo 2 so pode tocar comissoes que ainda NAO viraram
-- dinheiro. Se o numero abaixo for > 0, PARE — alguma linha alvo ja foi paga ou
-- vinculada a um saque, e o caminho passa a ser acerto manual, nao reapuracao.
SELECT count(*) AS alvos_indevidos
FROM referral_commissions rc
JOIN tenant_payments tp ON tp.id = rc.tenant_payment_id
WHERE tp.paid_at >= DATE '2026-07-01'
  AND (rc.status NOT IN ('PENDING', 'AVAILABLE') OR rc.payout_id IS NOT NULL);

-- ---------------------------------------------------------------------------
-- PASSO 1 — Libera as mensalidades de julho para reapuracao
-- ---------------------------------------------------------------------------
-- Julho vai ser reapurado pelo motor unico. As comissoes legadas do mesmo mes
-- precisam sair de cena, senao o indicador receberia DUAS VEZES pela mesma
-- competencia: R$ 119,50 do ledger legado + R$ 525,00 do fechamento mensal.
--
-- O recorte por `tp.paid_at` (e nao por `rc.created_at`) e proposital: o que
-- define a competencia e a data em que a mensalidade foi paga.
UPDATE referral_commissions rc
SET status = 'CANCELLED',
    cancelled_at = now(),
    cancel_reason = '[MIGRACAO] motor unico de comissao — reapurado no fechamento mensal'
FROM tenant_payments tp
WHERE tp.id = rc.tenant_payment_id
  AND tp.paid_at >= DATE '2026-07-01'
  AND rc.status IN ('PENDING', 'AVAILABLE')
  AND rc.payout_id IS NULL;
-- Esperado: UPDATE 5 (as cinco indicadas da CDA que pagaram em julho).

-- ---------------------------------------------------------------------------
-- PASSO 2 — Reapura pelo motor unico
-- ---------------------------------------------------------------------------
-- Dispara o cron de fechamento no runtime de producao. Ele fecha os ultimos 3
-- meses (CATCHUP_MONTHS) de forma idempotente, promove PENDING->AVAILABLE e
-- monta a lista de saques. Junho sai zerado (mensalidades ja comissionadas e
-- pagas), julho sai com o valor certo.
-- Confirme o corte antes de disparar:
SELECT "commission_unified_since" FROM "system_settings";  -- esperado: 2026-07

SELECT app_internal.run_cron('/api/cron/referral-monthly-payout');

-- ---------------------------------------------------------------------------
-- PASSO 3 — Conferencia
-- ---------------------------------------------------------------------------
-- Esperado:
--   carreiradigitalacademy  2026-07  FIXED  rate 75  unit_count 7  amount 525,00
--                            (bracket_count 6 = ativacoes do mes)
--   inovasuleducacional      —  nenhuma linha (a BE Educacional ainda nao pagou
--                               a mensalidade de julho; vence 18/07)
--   nenhuma linha de 2026-06 (junho ja liquidado no ledger legado)
SELECT t.slug, m.period, m.rate_type, m.rate, m.unit_count, m.base_sum,
       m.amount, m.status, m.available_at
FROM referral_monthly_commissions m
JOIN tenants t ON t.id = m.referrer_tenant_id
ORDER BY t.slug, m.period;

-- Caixa acumulado por indicador (o que os relatorios agora reportam como "pago").
SELECT t.slug, p.amount, p.status, p.paid_at
FROM referral_payouts p JOIN tenants t ON t.id = p.referrer_tenant_id
ORDER BY t.slug, p.paid_at;
