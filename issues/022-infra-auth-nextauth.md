# Issue 022 — Auth NextAuth.js v5

**Tipo:** infra
**Página:** global
**Depende de:** 020
**Prioridade:** P0

## O Que Fazer

Implementar NextAuth.js v5 (Auth.js) com provider credentials, role-based redirects, session com tenant_id. Users ADMIN → /admin, RESELLER → /painel, STUDENT → /loja.

## Componentes Envolvidos
- lib/auth.ts — NextAuth config (providers, callbacks, session)
- lib/auth/credentials-provider.ts — credentials provider logic
- app/api/auth/[...nextauth]/route.ts — auth API route
- middleware.ts — atualizado com proteção de rotas

## Comportamentos
- `login-credentials` — provider credentials (email + password)
- `role-redirect-admin` — ADMIN automaticamente → /admin
- `role-redirect-reseller` — RESELLER automaticamente → /painel
- `role-redirect-student` — STUDENT automaticamente → /loja
- `session-with-tenant` — session.user contém tenant_id
- `logout` — middleware limpa session

## Critério de Aceite
- [ ] lib/auth.ts criado com NextAuth config
- [ ] Credentials provider implementado (email + password validação Prisma)
- [ ] app/api/auth/[...nextauth]/route.ts criado
- [ ] Login em /login com form credentials
- [ ] ADMIN login redireciona /admin
- [ ] RESELLER login redireciona /painel
- [ ] STUDENT login redireciona /loja
- [ ] Session obtém tenant_id do User.tenant_id
- [ ] NEXTAUTH_SECRET configurado .env
- [ ] Logout limpa cookies
- [ ] Rotas protegidas requerem autenticação
