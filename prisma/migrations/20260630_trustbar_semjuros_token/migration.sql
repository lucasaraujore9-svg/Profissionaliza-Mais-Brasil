-- =============================================================
-- Migration: trust-bar "Até 12x sem juros" -> token dinâmico {{semJuros}}
-- Data: 2026-06-30
-- Idempotente.
--
-- A frase do selo de parcelamento do trust-bar (HomeSection institucional) era
-- fixa em "Até 12x sem juros" (semeada em 20260528_home_sections_institutional).
-- Passa a ser o token "{{semJuros}}", substituído em runtime pelo nº de parcelas
-- SEM JUROS configurado por cada unidade (Tenant.interestFreeInstallments) ou pela
-- PMB (SystemSettings.pmbInterestFreeInstallments) — coerente com o checkout.
--
-- Atinge a linha global (pmb-trustbar, tenant_id NULL) E cópias por-tenant. O
-- WHERE torna a migração idempotente (re-run não casa nada) e o replace toca só
-- a frase exata — preserva qualquer outra edição do admin.
-- =============================================================

UPDATE "home_sections"
SET "config" = replace("config"::text, 'Até 12x sem juros', '{{semJuros}}')::jsonb
-- Restrito ao trust_bar: é o único lugar onde o token {{semJuros}} é substituído
-- em runtime (TrustItem). Assim nenhum token literal vaza em outras seções.
WHERE "config"::text LIKE '%Até 12x sem juros%'
  AND "config"::text LIKE '%trust_bar%';
