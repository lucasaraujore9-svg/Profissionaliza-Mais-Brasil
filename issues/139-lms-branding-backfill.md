# Issue 139 — Backfill de branding (revendas existentes)

**Tipo:** devops
**Escopo:** `src/app/api/cron/sync-lms-branding/route.ts` (novo)
**Depende de:** 137
**Prioridade:** P2

## Contexto

A Issue 138 cobre novas/alteradas; as revendas que já existem precisam de um empurrão retroativo.

## O que fazer

- Endpoint no molde de `api/cron/resync-platform-passwords/route.ts`: Bearer `CRON_SECRET` (`isCronAuthorized`),
  dry-run default (aplica só com `?write=1`), `maxDuration=300`, concorrência limitada, nunca loga segredo.
- Iterar `Tenant` exceto `__pmb__` (`PMB_TENANT_SLUG`), chamando `putLmsTenantBranding` sob `isLmsConfigured()`.
- Disparo manual via `app_internal.run_cron` (segredos Sensitive não baixam local).

## Critérios de Aceite

- [ ] Dry-run lista as revendas e o que enviaria
- [ ] `?write=1` aplica o branding
- [ ] `__pmb__` é pulado
- [ ] `npx tsc --noEmit` + `npm run build` verdes
