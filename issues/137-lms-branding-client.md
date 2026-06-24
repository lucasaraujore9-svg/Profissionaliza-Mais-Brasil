# Issue 137 — Wrapper de branding (PUT /tenants/:id)

**Tipo:** infra
**Escopo:** `src/lib/lms/types.ts`, `src/lib/lms/client.ts`, `src/lib/lms/index.ts`
**Depende de:** —
**Prioridade:** P1

## Contexto

O LMS já tem `PUT /api/v1/tenants/:id` (branding) pronto, mas o PMB nunca chama — por isso todo aluno de
revenda vê a marca PMB (fallback). Criar o ponto que falta.

## O que fazer

- `types.ts`: `LmsTenantBrandingRequest { brandName?, logoUrl?, certificateBaseUrl? }`.
- `client.ts`: **adicionar `"PUT"` à union de métodos** de `lmsRequest`; `putLmsTenantBranding(tenantExternalId,
  body)`.
- `index.ts`: já reexporta `./client` (`export *`) — automático.
- Chave `:id = Tenant.id` (mesma usada nas matrículas/SSO).
- **Guardas:** `isLmsConfigured()` antes de chamar; **nunca** chamar para `__pmb__`/vitrine PMB.

## Critérios de Aceite

- [ ] Chamada manual com `Tenant.id` real → 200
- [ ] `npx tsc --noEmit` verde
