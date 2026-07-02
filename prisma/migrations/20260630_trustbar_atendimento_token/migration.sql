-- =============================================================
-- Migration: trust-bar "Segunda a sábado" -> token dinâmico {{horarioAtendimento}}
-- Data: 2026-06-30
-- Idempotente.
--
-- O subtítulo do selo "Suporte no WhatsApp" do trust-bar (HomeSection
-- institucional) era fixo em "Segunda a sábado" (semeado em
-- 20260528_home_sections_institutional). Passa a ser o token
-- "{{horarioAtendimento}}", substituído em runtime pelo Horário de atendimento
-- configurado por cada unidade (Tenant.supportHours) — coerente com o rodapé da
-- vitrine. Sem valor na unidade, a linha é ocultada; na home PMB usa o fallback
-- do próprio rodapé PMB.
--
-- Atinge a linha global (pmb-trustbar, tenant_id NULL) E cópias por-tenant. O
-- WHERE torna a migração idempotente (re-run não casa nada) e o replace toca só
-- a frase exata — preserva qualquer outra edição do admin.
-- =============================================================

UPDATE "home_sections"
SET "config" = replace("config"::text, 'Segunda a sábado', '{{horarioAtendimento}}')::jsonb
-- Restrito ao trust_bar: é o único lugar onde o token {{horarioAtendimento}} é
-- substituído em runtime (TrustItem). Assim nenhum token literal vaza em outras
-- seções.
WHERE "config"::text LIKE '%Segunda a sábado%'
  AND "config"::text LIKE '%trust_bar%';
