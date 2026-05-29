# Issue 070 — Contato publico roteado por tenant -> ContactMessage

**Tipo:** behavior
**Escopo:** `src/app/api/contato/route.ts` (novo) + `src/components/main/contact-form.tsx` + integracao no contexto loja
**Depende de:** 068, 069
**Prioridade:** P1

## Contexto

O formulario de contato publico passa a criar `ContactMessage` (kind=`CONTACT`) roteado por tenant, em vez de virar `Lead`. Visitante de uma vitrine de revenda fala com aquela unidade; visitante do site PMB fala com a PMB.

## O que fazer

### 1. Novo `src/app/api/contato/route.ts`

- Le header `x-tenant-id` (mesmo padrao do `/api/loja/leads`):
  - com header valido -> `tenantId` daquela unidade (validar que o tenant existe)
  - sem header -> PMB (`tenantId: null`)
- Schema Zod: `nome` (min 2), `email`, `telefone` (opcional, `isValidPhone`), `mensagem` (min 10), `assunto` (opcional), `source` (opcional).
- Cria `ContactMessage { kind: CONTACT, tenantId, nome, email, telefone, assunto, mensagem, source, ipAddress, userAgent }`.
- Rate limit (reaproveitar `RATE_LIMITS.leads` ou criar `RATE_LIMITS.contato`) + rate limit por email.
- Notificacao:
  - PMB (`tenantId` null): `audience: ROLE`, `roleTarget: SUPER_ADMIN`, categoria `support`, `href: /admin/atendimento`.
  - Unidade: `audience: TENANT`, `tenantId`, categoria `support`, `href: /painel/atendimento`.
- Email best-effort para o dono (PMB_SUPPORT_EMAIL ou `tenant.owner.email`), `replyTo` do remetente.

### 2. `src/components/main/contact-form.tsx`

- Postar para `/api/contato` (hoje `/api/leads`). Enviar `assunto` se o form tiver.

### 3. Contato no storefront (decisao: vai pra unidade)

- Disponibilizar o `ContactForm` no contexto da loja, enviando `x-tenant-id` via header (mesmo padrao do `lead-inquiry-card.tsx`). Pode ser um wrapper client que recebe `tenantId` por prop e injeta o header no fetch.

## Criterios de Aceite

- [ ] `/api/contato` cria `ContactMessage` kind=CONTACT roteado por tenant (header -> unidade; sem header -> PMB)
- [ ] `contact-form.tsx` posta para `/api/contato`
- [ ] Storefront tem contato proprio que cai na unidade dona
- [ ] Notificacoes roteadas (ROLE para PMB, TENANT para unidade), categoria `support`
- [ ] Rate limit aplicado
- [ ] `npx tsc --noEmit` + `npm run build` verdes
