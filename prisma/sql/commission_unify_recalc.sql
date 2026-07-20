-- ===========================================================================
-- RECALCULO RETROATIVO DA COMISSAO DE INDICACAO — passo MANUAL de producao
-- ===========================================================================
--
-- NAO e uma migration. Nao roda no build. Rode a mao (Supabase Management API)
-- DEPOIS que o deploy da unificacao estiver no ar, porque o passo 3 depende do
-- codigo novo.
--
-- Por que existe: ate a unificacao, `referralPercent` era gravado na pagina do
-- INDICADOR mas lido do tenant INDICADO. Como nenhuma indicada tinha o campo
-- preenchido, todas as comissoes cairam no padrao global de 10% — R$ 23,90 sobre
-- uma mensalidade de R$ 239 — enquanto os indicadores tinham 50% e 15%
-- configurados. As 7 linhas afetadas estao PENDING/AVAILABLE; NENHUMA foi paga.
--
-- Estrategia: as linhas erradas do ledger legado sao CANCELADAS (nao apagadas —
-- ficam como evidencia), o que as tira do filtro anti-duplicidade do motor
-- mensal; o fechamento entao reapura as competencias pelo motor unico, com a
-- regra correta. Os saques em REQUESTED sao desfeitos porque foram montados
-- sobre os valores errados; o proprio cron remonta com os valores certos.
--
-- Rode os passos NA ORDEM e confira a saida de cada um antes de seguir.

-- ---------------------------------------------------------------------------
-- PASSO 0 — Fotografia do "antes" (guarde esta saida)
-- ---------------------------------------------------------------------------
SELECT ref.slug AS indicador, ind.slug AS indicada, rc.percent, rc.amount,
       rc.status, rc.payout_id
FROM referral_commissions rc
JOIN tenants ref ON ref.id = rc.referrer_tenant_id
JOIN tenants ind ON ind.id = rc.referred_tenant_id
ORDER BY ref.slug, rc.created_at;

SELECT id, referrer_tenant_id, amount, status FROM referral_payouts;

-- TRAVA DE SEGURANCA: se qualquer comissao ja tiver sido PAGA, PARE.
-- O recalculo retroativo abaixo assume que nada saiu do caixa; com dinheiro ja
-- transferido o caminho e clawback manual, nao reapuracao.
SELECT count(*) AS pagas_bloqueiam_recalculo
FROM referral_commissions WHERE status = 'PAID';

-- ---------------------------------------------------------------------------
-- PASSO 1 — Desfaz os saques montados sobre os valores errados
-- ---------------------------------------------------------------------------
-- Desvincula primeiro (a FK e ON DELETE NO ACTION nas comissoes) e so entao
-- apaga. Nao usamos `failPayout()` de proposito: ele notifica a revenda com
-- "saque recusado", que seria uma mensagem errada para uma correcao nossa.
UPDATE referral_commissions
SET payout_id = NULL
WHERE payout_id IN (SELECT id FROM referral_payouts WHERE status = 'REQUESTED');

UPDATE referral_monthly_commissions
SET payout_id = NULL
WHERE payout_id IN (SELECT id FROM referral_payouts WHERE status = 'REQUESTED');

DELETE FROM referral_payouts WHERE status = 'REQUESTED';

-- ---------------------------------------------------------------------------
-- PASSO 2 — Cancela as comissoes legadas calculadas com o percentual errado
-- ---------------------------------------------------------------------------
-- CANCELLED e o unico status que o motor mensal reconhece como "esta mensalidade
-- voltou a estar disponivel para comissionar" (ver o filtro em monthly.ts).
UPDATE referral_commissions
SET status = 'CANCELLED',
    cancelled_at = now(),
    cancel_reason = '[MIGRACAO] motor unico de comissao — reapurado no fechamento mensal'
WHERE status IN ('PENDING', 'AVAILABLE');

-- ---------------------------------------------------------------------------
-- PASSO 3 — Reapura as competencias pelo motor unico
-- ---------------------------------------------------------------------------
-- Dispara o cron de fechamento no runtime de producao. Ele fecha os ultimos 3
-- meses (CATCHUP_MONTHS) de forma idempotente, o que cobre 2026-06 e 2026-07, e
-- em seguida promove PENDING->AVAILABLE e remonta os saques.
-- Requer as credenciais ja configuradas em app_internal.run_cron.
SELECT app_internal.run_cron('/api/cron/referral-monthly-payout');

-- ---------------------------------------------------------------------------
-- PASSO 4 — Conferencia (esperado)
-- ---------------------------------------------------------------------------
--   carreiradigitalacademy  2026-06  R$ 119,50   (1 mensalidade x 50%)
--   carreiradigitalacademy  2026-07  R$ 597,50   (5 mensalidades x 50%)
--   inovasuleducacional     2026-06  R$ 119,50   (1 mensalidade, 1o mes = 50%)
SELECT t.slug, m.period, m.rate_type, m.rate, m.unit_count, m.base_sum,
       m.amount, m.status, m.available_at
FROM referral_monthly_commissions m
JOIN tenants t ON t.id = m.referrer_tenant_id
ORDER BY t.slug, m.period;

SELECT p.id, t.slug, p.amount, p.status
FROM referral_payouts p
JOIN tenants t ON t.id = p.referrer_tenant_id;
