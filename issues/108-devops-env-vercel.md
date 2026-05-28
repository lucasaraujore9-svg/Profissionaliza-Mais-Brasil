# Issue 108 — Configurar variáveis de ambiente obrigatórias no Vercel

**Tipo:** devops / ops (remediação)
**Escopo:** Vercel project env (produção + preview) · referência: `src/lib/env.ts` e `.env.example` (atualizado)
**Depende de:** nenhuma
**Prioridade:** P1
**Risco:** R31 (Médio) — parte de código já corrigida (`.env.example`); resta a ação operacional

## Contexto / Evidência
`.env.example` foi alinhado a `src/lib/env.ts` na auditoria. Faltam variáveis efetivamente
configuradas no Vercel. A mais crítica: **`MP_WEBHOOK_SECRET`** — sem ela, em produção os webhooks do
Mercado Pago são **rejeitados** (`assertEnv` emite warning) e **a matrícula automática não acontece**.
Também faltam (usadas no código): `AUTH_SECRET`, grupo `PMB_*`, `WA_GATEWAY_*`, `EA_STUDENT_LOGIN_URL`,
`AXIOM_*`, `DATABASE_POOL_MAX`. E `SUPABASE_ACCESS_TOKEN` **não** deve ser env de runtime (é PAT admin).

## O Que Fazer
1. Conferir no Vercel todas as obrigatórias de `env.ts` (`requiredInProd`): `DATABASE_URL`,
   `AUTH_SECRET`(ou `NEXTAUTH_SECRET`), `ENCRYPTION_KEY`, `ASAAS_*`, `CRON_SECRET`, `INTERNAL_SECRET`,
   `EA_*`.
2. Configurar `MP_WEBHOOK_SECRET` (painel MP → webhook secret) em produção.
3. Configurar `PMB_*` (vitrine principal) e `WA_GATEWAY_*` (automação) se as features estão ativas.
4. **Remover** `SUPABASE_ACCESS_TOKEN` do runtime do Vercel (manter só local p/ MCP).
5. Validar boot: `assertEnv()` sem warnings de "Redis ausente" / "MP_WEBHOOK_SECRET ausente".

## Critério de Aceite
- [ ] Todas as obrigatórias de `env.ts` presentes em produção.
- [ ] `MP_WEBHOOK_SECRET` configurada → webhook MP aceito (teste com evento real/sandbox).
- [ ] `SUPABASE_ACCESS_TOKEN` ausente do runtime de produção.
- [ ] Sem warnings de env no log de boot de produção.
- [ ] R31 movido para "Corrigido" em `audit/MATRIZ_DE_RISCOS.md`.
