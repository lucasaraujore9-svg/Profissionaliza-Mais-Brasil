# Fase 1 — Arquitetura e Organização

> Auditoria de código — Profissionaliza Mais Brasil
> Data: 2026-05-30 · Auditor: revisão sistemática assistida

## 1. Panorama quantitativo

| Métrica | Valor |
|---|---|
| Arquivos `.ts`/`.tsx` em `src/` | 764 |
| Linhas de código (`src/`) | ~98.276 |
| Route handlers (`api/**/route.ts`) | 216 |
| Páginas (`page.tsx`) | 112 |
| Models Prisma | ~45 |
| Enums Prisma | ~22 |
| Migrations | 34 |
| Subpastas em `src/lib/` | 26 domínios |

## 2. Stack confirmada (em uso real)

- **Next.js 16.2** (App Router) + React 19.2 + TypeScript 5 strict
- **Prisma 7.7** com `@prisma/adapter-pg` (driver `pg` 8.20) → PostgreSQL (Supabase)
- **NextAuth v5 beta.30** (Credentials, estratégia JWT)
- **Upstash Redis** (`@upstash/redis` + `@upstash/ratelimit`) — cache de tenant + rate limit
- **Tailwind 4** + shadcn/ui + base-ui + lucide
- **Supabase Storage** (logos, capas, certificados) — via client `@supabase`
- **Mercado Pago** SDK 2.12, **Asaas** (REST custom), **Resend** + React Email + Nodemailer
- **Observabilidade**: Pino 10 (logs estruturados), Vercel Analytics/Speed Insights
- PDF: `@react-pdf/renderer` + `jspdf` + `qrcode` (certificados)
- PWA: `web-push`, service worker

## 3. Organização de pastas (avaliação)

**Pontos fortes:**
- Separação clara `app/` (rotas) × `components/` (UI por contexto: admin/painel/loja/aluno/shared) × `lib/` (lógica/dados por domínio).
- `lib/` segue **fat server / thin client**: domínios isolados (`asaas/`, `mercadopago/`, `certificates/`, `referrals/`, `automation/`, `tenant/`, `students/`...).
- Multi-tenant roteado em `src/proxy.ts` (Edge), com classificação de host robusta (app domain × vitrine apex × tenant subdomain × custom domain) e **sanitização de headers `x-tenant-*` injetados pelo cliente** (linha 200-202) — boa defesa contra spoofing de tenant.
- Auth centralizada: `src/lib/auth.ts` (NextAuth) + helpers de sessão em `src/lib/auth/` (`admin-session`, `student-session`, `reseller-session`, `guards.ts`, `bearer.ts`, `impersonate.ts`).
- Migrations versionadas e com script `db:apply-pending` no build.

**Pontos de atenção (a aprofundar nas próximas fases):**
- **123 dos 216** route handlers referenciam helpers de sessão (`requireAdminSession`/`requireStudentSession`/`requireResellerSession`). Os ~93 restantes precisam de verificação caso a caso: webhooks (assinatura), crons (`CRON_SECRET`), rotas `internal` (`INTERNAL_SECRET`), rotas públicas (loja/leads/validar) — **mas é preciso confirmar que nenhuma rota mutável ficou sem guarda** (Fase 3/4).
- **RLS do Supabase essencialmente não está em uso como camada de segurança**: o app acessa o banco via Prisma/`pg` com string de conexão de owner — RLS é bypassada. A segurança multi-tenant depende **100% da camada de aplicação** (filtros `tenantId` nas queries). Isso precisa de varredura exaustiva na Fase 2/3: qualquer query sem `tenantId` no contexto de vitrine = vazamento cross-tenant. (Só há 1 referência a policy nas migrations, em `notification_preferences`.)
- **CSP com `'unsafe-inline'` e `'unsafe-eval'`** em `script-src` (next.config.ts:32) — necessário hoje pelo SDK do Mercado Pago e Tailwind inline, mas reduz proteção XSS. Avaliar nonces na Fase 2/6.
- Pastas duplicadas de scaffold no repo (`vibe-scaffold/`, `claude-export-kit/`, `.claude-skills/`) — ruído, não afeta runtime mas polui o repositório.
- `tsconfig.tsbuildinfo` (~600KB) versionado/presente — verificar `.gitignore`.

## 4. Segurança de configuração (verificado nesta fase)

| Item | Status |
|---|---|
| Segredos versionados no git | ✅ Apenas `.env.example`. `.env.local` e `.env.vercel.production` estão **gitignored**. |
| Variáveis `NEXT_PUBLIC_*` sensíveis | ✅ Só URLs/anon key públicos. Nenhum secret/service_role com prefixo público. |
| Headers de segurança globais | ✅ HSTS, X-Content-Type-Options, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy, CSP. |
| `service_role` no client | ⚠️ A confirmar na Fase 2 — uso de Supabase em `lib/certificates/storage.ts` e `lib/supabase/storage.ts` deve ser server-only. |
| Rate limit no login | ✅ `rateLimitByKey` por IP+email no `authorize()` (fail-open em dev sem Redis). |
| Cookies de sessão | ✅ `__Secure-` prefix em prod, httpOnly, sameSite=lax, secure. |

## 5. Auth — arquitetura observada

- Login único (`authorize`) que tenta **User** (SUPER_ADMIN/PMB_SALES/PMB_RESELLER_MGR/RESELLER) e depois **Student** escopado por tenant do subdomínio.
- Consultor: `User role=RESELLER` sem `tenantId` direto → vínculo via `TenantMember`, resolvido no `authorize` e promovido ao JWT.
- Guards em `guards.ts` no padrão `{ ok, session } | { ok, response }`.
- **A aprofundar (Fase 3):** coerência entre guarda no route handler × guarda no layout × filtro no banco. Risco de escalonamento de privilégio (auto-alteração de role) a investigar nas rotas de `equipe`/`me`/`revendedores`.

## 6. Próximas fases (plano)

1. **Fase 2 — Segurança (prioridade máxima):** varredura de isolamento multi-tenant (queries sem `tenantId`), escalonamento de privilégio, exposição de chaves, validação de input (Zod) em todos os handlers mutáveis, autenticação de webhooks/crons, CSP/CORS/rate-limit.
2. **Fase 3 — Níveis de acesso:** matriz de papéis × rotas × mutações; rotas só protegidas no client; coerência front/back.
3. **Fase 4 — Rotas e APIs:** tratamento de erro, status codes, paginação, N+1, índices.
4. **Fase 5 — Bugs e qualidade:** `tsc --noEmit`, `eslint`, `next build`, `npm audit`; promessas não tratadas, hooks, `any`.
5. **Fase 6 — Acessibilidade (WCAG):** semântica, contraste, labels, ARIA, teclado.
6. **Fase 7 — Boas práticas:** convenções Next/React/TS, performance, deps vulneráveis, logs.

## 7. Achados da Fase 1 (registrados)

| # | arquivo:linha | severidade | descrição | correção recomendada |
|---|---|---|---|---|
| A1-01 | `next.config.ts:32` | Médio | CSP usa `'unsafe-inline'` + `'unsafe-eval'` em `script-src`, ampliando superfície de XSS. | Migrar para CSP por nonce nas rotas HTML; isolar `unsafe-eval` apenas onde o SDK MP exige. |
| A1-02 | arquitetura (Prisma×Supabase) | Informativo→Alto | RLS não atua como camada de defesa; isolamento multi-tenant é 100% aplicação. | Confirmar na Fase 2 que **toda** query de vitrine filtra `tenantId`; considerar RLS defense-in-depth. |
| A1-03 | repo root | Baixo | Pastas de scaffold duplicadas (`vibe-scaffold/`, `claude-export-kit/`, `.claude-skills/`) e `tsbuildinfo` no repo. | Mover para `.gitignore`/remover do versionamento. |
| A1-04 | 93 route handlers | A verificar | Handlers sem referência a helper de sessão — precisam de classificação (webhook/cron/internal/público vs. gap real). | Inventário completo na Fase 3/4. |
