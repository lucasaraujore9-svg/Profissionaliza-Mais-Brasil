# Inventário — Profissionaliza Mais Brasil
_Data: 2026-06-20 · Base de cobertura total (sem amostragem) para a auditoria_

> Stack: Next.js 16 (App Router) + TypeScript strict · Prisma 7 + PostgreSQL (Supabase) · NextAuth v5 ·
> Upstash Redis (REST) · Vercel. ⚠️MIGRAÇÃO iminente p/ VPS (Docker Swarm + Traefik + Postgres
> self-hosted + Redis TCP + MinIO).

## Contagens

| Categoria | Total |
|---|---|
| Arquivos `.ts`/`.tsx` em `src/` | **959** |
| **Rotas** (arquivos de rota em `app/`) | **436** |
| └ `page.tsx` (telas) | **124** |
| └ `route.ts` (route handlers, inclui 1 `llms.txt/route.ts` fora de `/api`) | **281** |
| └ `layout.tsx` | **9** |
| └ `loading.tsx` | **5** · `error.tsx` **5** · `not-found.tsx` **6** · `global-error.tsx` **1** |
| **Telas navegáveis** (page.tsx) | **124** |
| **Server Actions** (`"use server"`) | **2** |
| **Métodos HTTP** exportados | GET **132** · POST **139** · PUT **30** · PATCH **43** · DELETE **30** |
| **Funções/consts exportadas** em `lib/` (aprox.) | **577** |
| **Hooks** (`use*` exportados) | **1** (`use-home-sections.ts`) |
| **Componentes** (`components/**`) | **322** |
| **Arquivos em `lib/`** | **198** |
| **Testes** (`*.test.ts(x)`) | **8** |
| **Models Prisma** | **43** · **Enums** 32 |
| **Migrations** | **67** |
| **Crons** (route handlers em `api/cron`) | **13** (agendados via Supabase pg_cron; `vercel.json` crons = `[]`) |
| **Webhooks** | **2** (Asaas, Mercado Pago) |

> Observação arquitetural: o sistema é **API-route-cêntrico** (281 route handlers) e quase não usa
> Server Actions (só 2). Toda mutação passa por route handler → a auditoria de AuthZ/Zod/tenant
> foca nos route handlers.

---

## Rotas — arquivos especiais e convenções

- **Route groups:** `(auth)`, `(landing)`, `(main)`.
- **Segmentos dinâmicos:** `[slug]`, `[id]`, `[type]`, `[code]`, `[paymentId]`, `[enrollmentId]`,
  `[moduleId]`, `[packageId]`, `[...nextauth]` (catch-all), `[enrollmentId]`, `[paymentId]`.
- **Sem** segmentos paralelos `@slot` nem interceptados `(.)`/`(..)`; sem `template.tsx`/`default.tsx`.
- **Especiais raiz:** `app/layout.tsx`, `app/error.tsx`, `app/global-error.tsx`, `app/not-found.tsx`.
- **Por área (com seus próprios `loading/error/not-found`):** `(main)`, `admin`, `aluno`, `painel`, `loja`.

---

## Telas (124 `page.tsx`) — por área

### Públicas / institucionais — `(main)` (18) + `(auth)` (3) + `(landing)` (3) + `livrecursos` (1) + raiz (6)
- `(auth)`: `/login`, `/forgot-password`, `/reset-password`
- `(landing)`: `/seja-revendedor`, `/seja-revendedor/checkout`, `/lp-revenda2`
- `(main)`: `/` (home), `/cursos`, `/cursos/[slug]`, `/categoria/[slug]`, `/pacotes/[slug]`,
  `/cursos-tecnicos/ir`, `/eja/ir`, `/checkout`, `/checkout/confirmacao`, `/certificado`,
  `/contato`, `/ajuda`, `/como-funciona`, `/sobre`, `/contrato-de-revenda`, `/privacidade`,
  `/termos`, `/reembolso`
- `livrecursos`: `/livrecursos` (landing captação revenda)
- Raiz (sem grupo): `/alterar-senha-inicial`, `/inadimplente`, `/logout`, `/offline`, `/placar`,
  `/validar`, `/validar/[code]`, `/cobranca/[paymentId]`

### Admin Master — `admin` (43)
`/admin`, `/admin/alunos`, `/admin/alunos/[id]`, `/admin/analytics`, `/admin/atendimento`,
`/admin/automacao`, `/admin/automacao/conexao`, `/admin/automacao/mensagens`, `/admin/banner`,
`/admin/catalogo`, `/admin/certificados`, `/admin/certificados/configuracoes`,
`/admin/certificados/emitir`, `/admin/certificados/template-padrao`, `/admin/comunicacao`,
`/admin/configuracoes`, `/admin/configuracoes/automacao`, `/admin/configuracoes/certificados`,
`/admin/configuracoes/indicacoes`, `/admin/configuracoes/rastreamento`,
`/admin/configuracoes/unidade-tecnica`, `/admin/equipe`, `/admin/equipe/[id]`,
`/admin/financeiro`, `/admin/indicacoes`, `/admin/indicacoes/comissoes`, `/admin/indicacoes/saques`,
`/admin/leads`, `/admin/leads-revenda`, `/admin/meu-perfil`, `/admin/notificacoes`,
`/admin/relatorios`, `/admin/relatorios/[type]`, `/admin/revendedores`, `/admin/revendedores/[id]`,
`/admin/revendedores/[id]/comissoes`, `/admin/treinamentos`, `/admin/vendas`, `/admin/vendas/nova`,
`/admin/vendas/cupons`, `/admin/vendas/alunos`, `/admin/vendas/alunos/[id]`, `/admin/vitrine`

### Revendedor — `painel` (30)
`/painel`, `/painel/alunos`, `/painel/alunos/[id]`, `/painel/atendimento`, `/painel/automacao`,
`/painel/automacao/conexao`, `/painel/automacao/mensagens`, `/painel/certificados`,
`/painel/certificados/emitir`, `/painel/certificados/emitidos`, `/painel/certificados/template`,
`/painel/comunicacao`, `/painel/configuracoes`, `/painel/cupons`, `/painel/cursos`,
`/painel/dominio`, `/painel/equipe`, `/painel/financeiro`, `/painel/indicacoes`,
`/painel/indicacoes/materiais`, `/painel/indicacoes/sacar`, `/painel/leads`,
`/painel/leads/configuracao`, `/painel/notificacoes`, `/painel/onboarding`,
`/painel/treinamentos`, `/painel/treinamentos/[moduleId]`, `/painel/vendas`, `/painel/vendas/nova`,
`/painel/vitrine`

### Aluno — `aluno` (9)
`/aluno`, `/aluno/cursos`, `/aluno/certificados`, `/aluno/certificados/[id]`, `/aluno/comprar`,
`/aluno/notificacoes`, `/aluno/pagamentos`, `/aluno/perfil`, `/aluno/suporte`

### Vitrine multi-tenant — `loja` (9)
`/loja`, `/loja/cursos`, `/loja/curso/[slug]`, `/loja/pacote/[slug]`, `/loja/checkout`,
`/loja/confirmacao`, `/loja/contato`, `/loja/pagar/[id]`, `/loja/suspended`

---

## Server Actions (2)
- `src/app/inadimplente/page.tsx` (`use server`)
- `src/app/validar/page.tsx` (`use server`)

---

## Route handlers (281 `route.ts`) — por área

| Área | Qtd | Notas |
|---|---|---|
| `api/admin/**` | 126 | Admin Master: alunos, catálogo, certificados, comissões/indicações, config, cupons, equipe, financeiro, home-sections, leads, leads-revenda, notificações, pacotes, referrals, relatórios, revendedores, system-settings, tenants, treinamentos, vendas |
| `api/painel/**` | 82 | Revendedor: alunos, atendimento, automação, banner, certificates, comunicação, config, cupons, cursos, dashboard, domínio, equipe, financeiro, home-sections, indicações, leads, onboarding, pacotes, referrals, tracking, treinamentos, vendas, vitrine |
| `api/cron/**` | 13 | cleanup-webhook-logs, reactivate-paid, reconcile-tenant-payments, referral-monthly-payout, sweep-abandoned-leads, sweep-students-expired, sweep-students-overdue, sweep-tenants-overdue, sweep-visitor-events, sync-cursos, sync-cursos-lms, sync-day-update-lms, sync-progresso |
| `api/loja/**` | 11 | Vitrine: checkout (+package/process/status), checkout-inquiry, confirmacao/[id], courses, cupom/validar, cursos/[slug], leads, track |
| `api/aluno/**` | 9 | catalogo, comprar, conta, curso/[enrollmentId]/acessar, pagamentos/verificar, perfil, senha, senha-plataforma, suporte |
| `api/auth/**` | 6 | [...nextauth], alterar-senha-inicial, forgot-password, handoff, handoff/start, reset-password |
| `api/checkout/**` | 5 | checkout, confirmacao/[id]/status, mp/process, package, status |
| `api/notifications/**` | 4 | listar, [id]/read, read-all, preferences |
| `api/push/**` | 4 | devices, devices/[id], public-key, subscribe |
| `api/cobranca/**` | 3 | [paymentId], [paymentId]/billing-info, [paymentId]/pay-card |
| `api/webhooks/**` | 2 | asaas, mercadopago |
| `api/public/**` | 2 | capture-ref, validate-ref |
| `api/student/**` | 2 | certificates/[id]/download, certificates/issue |
| `api/vitrine/**` | 1 | manifest |
| `api/internal/**` | 1 | resolve-tenant (chamado pelo proxy no Edge) |
| Top-level `api/*` | 9 | contato, health, leads, catalogo/sugestoes, home/showcase, metrics/public, pmb/leads, revendedores/cadastro, placar/stream |
| Fora de `/api` | 1 | `app/llms.txt/route.ts` |

> Lista exaustiva de caminhos foi enumerada via `find src/app -name route.ts` (281 arquivos) — base
> para a matriz de cobertura em `COBERTURA.md`.

---

## Funções e hooks — `lib/` (198 arquivos, ~577 exports) por módulo

| Módulo | Arq. | Escopo |
|---|---|---|
| `auth` | 15 | NextAuth config, guards (`{ok,session}|{ok,response}`), sessão, roles |
| `certificates` | 15 | emissão, freshness PDF, scope admin, templates |
| `asaas` | 10 | client billing PMB (cobrança revendas) |
| `catalog` | 10 | sync EA, listagem, visibilidade de preço |
| `tenant` | 9 | resolver multi-tenant, `urls.ts` (helpers de domínio), cache |
| `mercadopago` | 9 | client MP por tenant, webhook process, checkout transparente |
| `students` | 9 | status derivado, display-status, bloqueio |
| `referrals` | 9 | motor de comissão (legado + MONTHLY_TIERED), payouts, clawback |
| `automation` | 8 | WhatsApp/templates |
| `lms` | 6 | client LMS (lms.bmbr.com.br), provisionamento, day-update |
| `email` | 5 | brand tenant-aware, templates Resend/React Email |
| `redis` | 4 | Upstash REST (⚠️MIGRAÇÃO: não fala TCP) |
| `tracking` | 4 | pixels, visitor events |
| `seo` | 4 | metadata, llms.txt |
| `home` | 4 | home sections/showcase |
| `coupons` `packages` `plataforma-cursos` `validation` `observability` `notifications` | 3 cada | desconto; pacotes; client EA (form-data); CPF/Zod; logs/health; notif |
| `checkout` `storage` `reports` | 2 cada | due-date; Supabase Storage; relatórios |
| `lgpd` `enrollment` `training` `revendedor` `admin` `vercel` `placar` `http` `supabase` `schemas` `api` | 1 cada | — |
| Raiz `lib/*.ts` | ~30 | `prisma.ts`, `redis.ts`, `ratelimit.ts`, `crypto.ts`, `auth.ts`, `audit.ts`, `auto-block.ts`, `branding.ts`, `csv.ts`, `dates.ts`, `env.ts`, `errors.ts`, `images.ts`, `logger.ts`, `logger-client.ts`, `notifications.ts`, `pmb-config.ts`, `pmb-tenant.ts`, `suggest-password.ts`, `system-settings.ts`, `utils.ts` |

**Hooks (1):** `src/components/vitrine/use-home-sections.ts`

---

## Componentes (322) — por diretório

| Dir | Qtd |
|---|---|
| `admin` | 96 |
| `painel` | 68 |
| `main` | 51 |
| `shared` | 36 |
| `loja` | 24 |
| `ui` (shadcn) | 20 |
| `aluno` | 10 |
| `vitrine` | 6 |
| `auth` | 5 |
| `pwa` | 2 · `livrecursos` 2 |
| `placar` | 1 · `seo` 1 |

---

## Middleware / runtime

- **`src/proxy.ts`** (Next 16: convenção `proxy`, não `middleware`) — roteamento multi-tenant no Edge.
  - `export const config.matcher = ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"]`
  - Resolve tenant por hostname (subdomínio `livrecursos.com.br` / `customDomain`), cache Redis + fallback `api/internal/resolve-tenant`.
- **`src/instrumentation.ts`** — instrumentação/observabilidade.
- ⚠️ Bug conhecido (CLAUDE.md): convenção `middleware` deprecada no Next 16 → já migrado p/ `proxy`.

---

## Banco — 43 models / 32 enums (Prisma)

Models: AuditLog, AutomationMessageTemplate, BannerSlide, Category, Certificate,
CertificateTemplate, ContactMessage, Coupon, Course, CourseCategory, CourseLesson, CoursePackage,
CoursePackageItem, Enrollment, HomeSection, Lead, Notification, NotificationCategoryConfig,
NotificationPreference, Payment, PushSubscription, ReferralCommission, ReferralMonthlyCommission,
ReferralPayout, Student, StudentLead, StudentLeadActivity, StudentNote, SystemSettings, Tenant,
TenantCourse, TenantMember, TenantNotificationOverride, TenantPackage, TenantPayment,
TenantSlugRedirect, TenantSupportNote, TrainingModule, TrainingProgress, TrainingVideo, User,
VisitorEvent, WebhookLog.

> ⚠️ Memória do projeto: **não há RLS no banco** — isolamento multi-tenant é feito em código
> (todo query deve filtrar por `tenantId`). Este é o ponto P0 estrutural a validar em `banco`/`seguranca`.

---

## Testes existentes (8)
`crypto.test.ts`, `dates.test.ts`, `certificates/admin-scope.test.ts`,
`certificates/freshness.test.ts`, `checkout/due-date.test.ts`, `coupons/discount.test.ts`,
`mercadopago/webhook.test.ts`, `validation/cpf.test.ts`.

---

## Portão Zero-Erro — scripts disponíveis (package.json)
- `typecheck` → `tsc --noEmit`
- `lint` → `eslint`
- `build` → `npm run db:apply-pending && next build` ⚠️ **`db:apply-pending` toca o banco de produção**
  (`scripts/apply-pending-migrations.mjs`) — no portão local rodar `next build` direto (ou neutralizar
  a etapa de migração) para não aplicar migration sem autorização.
- `test` → `vitest run`

Gerenciador de pacotes: **npm** (`package-lock.json`).
