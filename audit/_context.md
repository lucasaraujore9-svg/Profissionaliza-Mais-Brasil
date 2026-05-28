# Auditoria PMB — Contexto Arquitetural Compartilhado (LEIA PRIMEIRO)

> Este arquivo é o briefing do Orquestrador para todos os agentes especialistas.
> Ele resume fatos confirmados sobre a arquitetura para você não perder tempo
> redescobrindo o básico. **Verifique os detalhes nos arquivos reais**; cite
> sempre `arquivo:linha`.

## O que é o projeto
SaaS multi-tenant de revenda de cursos. 3 atores: Admin Master (PMB), Revendedores
(tenants, vitrines próprias), Alunos. Cobrança de revendedores via **Asaas**; vendas
de cursos via **Mercado Pago** (token do revendedor, criptografado). Matrícula
automática numa **plataforma parceira** (API form-data). Hospedagem **Vercel**.

## Stack confirmada
- Next.js **16.2.6** (App Router) + React 19.2.4 + TypeScript strict
- Prisma **7.7** com `@prisma/adapter-pg` + `pg` Pool (NÃO usa Prisma Migrate em deploy)
- PostgreSQL via **Supabase** (cloud, ref `jpwskehhnplmmtgyyxmf`)
- NextAuth **v5 beta** (Credentials, JWT strategy)
- Upstash Redis (cache de tenant + rate limit)
- Tailwind 4 + shadcn/ui
- Zod 4 (validação), Zustand 5 (state)
- Email: SMTP Hostinger (principal) + Resend (fallback) + React Email
- Gerenciador: **npm** (package-lock.json)

## FATO CRÍTICO #1 — RLS está efetivamente AUSENTE / bypassed
`src/lib/prisma.ts` cria um `pg.Pool` com `DATABASE_URL` (usuário `postgres`,
dono das tabelas no Supabase). Prisma se conecta como owner ⇒ **Row Level
Security do Postgres NÃO é aplicado** mesmo se policies existissem. Só 1 migration
menciona RLS (`20260430_notification_preferences`). Conclusão: **todo o controle
de acesso é feito em código de aplicação** (guards + filtros `where tenantId`).
Implicações:
- Não existe rede de segurança no banco. Um único route handler que esqueça de
  filtrar por `tenantId`/`userId` = vazamento cross-tenant direto.
- O agente de Supabase/RLS deve avaliar (a) ausência de RLS como risco de
  defesa-em-profundidade, (b) se o Storage (bucket público `vitrine-assets`) tem
  policy, (c) se a anon key é usada em algum lugar do client.

## FATO CRÍTICO #2 — Não há testes automatizados
0 arquivos `*.test.*`/`*.spec.*`. CI (`.github/workflows/ci.yml`) roda apenas
`lint` + `typecheck` + `npm audit` (informativo, não bloqueia). Build aplica
migrations no banco (`scripts/apply-pending-migrations.mjs`).

## Multi-tenant / Proxy (`src/proxy.ts`)
- Convenção Next 16 `proxy` (não `middleware`). Roda no edge.
- Domínios: `profissionalizamaisbrasil.com.br` = app (institucional+admin+painel+aluno+loja direto);
  `livrecursos.com.br` = landing revendedor; `{slug}.livrecursos.com.br` = vitrine tenant;
  custom domains via lookup no DB.
- Proxy **sanitiza** `x-tenant-id`/`x-tenant-slug` recebidos do cliente (bom) e só
  os re-injeta quando resolve o tenant. **Proxy NÃO faz autenticação** — auth é por
  rota via NextAuth/guards.
- Resolução de custom domain: chama `/api/internal/resolve-tenant` com `INTERNAL_SECRET`.
- Pega `x-tenant-id` só do cache Redis; em miss, só `x-tenant-slug` é setado.

## Autenticação (`src/lib/auth.ts`)
- NextAuth v5, Credentials, bcryptjs, JWT. Cookies endurecidos (`__Secure-`, httpOnly,
  sameSite lax, secure em prod). Rate limit de login por IP+email (Upstash; **falha
  em modo ABERTO se Redis ausente**). Login de aluno escopado por tenant do subdomínio.
  Bloqueia status != ATIVO (User) e BLOQUEADO/INATIVO (Student). Eventos logados (Pino).
- Roles: `SUPER_ADMIN`, `PMB_SALES`, `PMB_RESELLER_MGR`, `RESELLER` + `STUDENT` (sessão).
  Consultor = User role RESELLER vinculado via `TenantMember` (tenantId resolvido no JWT).

## Guards (`src/lib/auth/guards.ts`)
Padrão `{ ok:true, session } | { ok:false, response }`. Funções:
`requireSuperAdmin`, `requirePmbTeam`, `requirePmbSales`, `requirePmbResellerMgr`,
`requireResellerOwner(tenantId)`, `requireResellerMember(tenantId)`.
**Pergunta-chave para os agentes:** cada uma das 200 rotas chama o guard correto e
filtra por tenant? Há rotas que confiam em `tenantId` vindo do body/query do cliente?

## Superfície (inventário)
- **200** route handlers em `src/app/api/**/route.ts`
- **108** páginas (`page.tsx`); **253** componentes; **107** libs
- Apenas **2** arquivos `"use server"` (server actions quase não usadas; lógica em API routes)
- **31** migrations SQL em `prisma/migrations/`; **31** models no schema
- Áreas de API: `admin/`, `painel/`, `aluno/`, `loja/`, `checkout/`, `cobranca/`,
  `webhooks/` (asaas, mercadopago), `cron/`, `internal/`, `public/`, `push/`,
  `notifications/`, `pmb/`, `revendedores/`, `leads/`, `student/`, `health/`, `metrics/`

## Headers de segurança (`next.config.ts`)
HSTS, X-Content-Type-Options nosniff, X-Frame-Options DENY, Referrer-Policy,
Permissions-Policy. **CSP tem `'unsafe-inline'` e `'unsafe-eval'` em script-src**
(justificado: SDK Mercado Pago + inline styles). `images.remotePatterns`:
`*.supabase.co`, `playcurso.com`.

## Integrações e segredos (nomes; NÃO expor valores)
- `SUPABASE_SERVICE_ROLE_KEY` (Storage server-side, `src/lib/supabase/storage.ts`, bucket público `vitrine-assets`)
- `ENCRYPTION_KEY` (AES-256-GCM para `mpAccessToken` do tenant)
- `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`, `EA_API_TOKEN` (plataforma), `VERCEL_TOKEN`
- `CRON_SECRET`, `INTERNAL_SECRET`, `NEXTAUTH_SECRET`/`AUTH_SECRET`
- `PMB_MP_ACCESS_TOKEN` (plain), `VAPID_*` (web push)
- `.env.local` e `.env.vercel.production` existem no disco e estão gitignored —
  **NÃO leia/exponha conteúdo**; o `.env.example` é a referência segura.

## Webhooks
- MP (`src/app/api/webhooks/mercadopago/route.ts`): rejeita sem `x-signature`/`x-request-id`
  em prod, valida HMAC em `processMpWebhook`, idempotência por `mpPaymentId`, redige assinatura no log.
- Asaas (`src/app/api/webhooks/asaas/route.ts`): verificar token no header.

## npm audit (já executado) — 14 vulns (1 HIGH, 10 moderate, 3 low)
- **HIGH**: `xlsx` (prototype pollution + ReDoS, sem fix) — usado em exports
- moderate: `nodemailer` (SMTP injection, via next-auth/@auth/core), `postcss` (dev),
  `uuid` (via mercadopago), `brace-expansion`, `@hono/node-server` (via @prisma/dev)
- `docs/SECURITY.md` supostamente documenta o risco aceito do xlsx — confirmar.

## Comandos de validação (resultado do Orquestrador)
- `npm run typecheck` → **exit 0** (verde)
- `npm run lint` → **exit 0** (verde)
- `npm audit` → 14 vulns (esperado)
- `npm run build` → **NÃO executar**: o script `build` roda `db:apply-pending` que
  MUTA o banco de produção. Para validar build use `SKIP_PENDING_MIGRATIONS=1 npx next build`.

## Como reportar (formato obrigatório por achado)
```
### [Severidade] Título
- Agente responsável:
- Categoria:
- Arquivo:
- Linha/trecho:
- Evidência:
- Descrição:
- Impacto:
- Cenário de risco:
- Recomendação:
- Correção aplicada:
- Status: Corrigido | Parcialmente | Recomendado | Requer decisão humana | Não reproduzido
- Confiança: Alta | Média | Baixa
```
Severidades: Crítico, Alto, Médio, Baixo, Informativo. Sem frases genéricas.
Cada achado precisa de evidência real (arquivo:linha). Separe confirmado de hipótese.
