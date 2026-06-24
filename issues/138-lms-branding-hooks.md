# Issue 138 — Disparar branding na criação/edição de revenda

**Tipo:** behavior
**Escopo:** `src/lib/resellers/create.ts`, `src/app/api/painel/vitrine/route.ts`,
`src/app/api/painel/vitrine/upload/route.ts`
**Depende de:** 137
**Prioridade:** P1

## Contexto

Manter o branding sincronizado automaticamente quando uma revenda é criada ou troca logo/nome.

## O que fazer (best-effort, `try/catch`, sob `isLmsConfigured()`)

- `create.ts`: após `prisma.tenant.create`, registrar branding (molde do bloco best-effort de bootstrap).
- `vitrine/route.ts`: após `tenant.update`/`invalidateTenant`, reler via `readTenant` e registrar branding.
- `vitrine/upload/route.ts`: POST → enviar `logoUrl = publicUrl` do bucket; **DELETE → enviar `logoUrl: null`**
  (reverter para fallback).

## Critérios de Aceite

- [ ] Criar/editar/remover-logo de revenda → LMS recebe branding (200)
- [ ] Falha do LMS não derruba o fluxo (best-effort)
- [ ] Sem `LMS_API_*`, criar revenda **não** quebra
- [ ] `npx tsc --noEmit` + `npm run build` verdes
