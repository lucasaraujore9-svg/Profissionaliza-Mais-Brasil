# Auditoria — Segurança
_Data: 2026-06-20 · Referência: .claude/skills/auditoria-saas/references/01-seguranca.md · Itens do inventário cobertos: 280/280 route handlers + 2 Server Actions + camada auth/lib + proxy + next.config + webhooks + migrations_

## Resumo
- Itens verificados: 280 route handlers (100%), 2 Server Actions, `src/lib/auth/*` (16 arq.), `src/lib/crypto.ts`, `src/lib/ratelimit.ts`, `src/lib/redis.ts`, `src/lib/env.ts`, `src/proxy.ts`, `next.config.ts`, 2 webhooks, 67 migrations, `.gitignore`/`.env.example`/`.mcp.json`, `npm audit`.
- **Achados: P0=0 · P1=1 · P2=2 · P3=3 · Nota do domínio: 8.5/10**
- Postura geral **madura**: guards centralizados (`{ok,session}|{ok,response}`), tenant derivado SEMPRE da sessão (zero IDOR por `tenantId` de input), webhooks com HMAC/token timing-safe + redação, segredos fora do repo, crypto AES-256-GCM correta, headers de segurança + CSP presentes, rate-limit em todos os fluxos públicos/auth, SSO single-use, impersonation HMAC-assinada e SUPER_ADMIN-only, dev-bypass de HMAC barrado em prod. Os achados abaixo são endurecimentos, não brechas exploráveis de imediato.

## Achados

### [SEG-001] Isolamento multi-tenant 100% em código — sem RLS como rede de segurança (defense-in-depth ausente)
- **Severidade:** P1
- **Status:** Aberto
- **Local:** `prisma/migrations/**` (43 models, 0 com RLS de tenant); única RLS existente é `prisma/migrations/20260430_notification_preferences/migration.sql:19-23` (`deny_anon` numa só tabela) · confirmado por `grep -rl "row level security" prisma/migrations` (0 statements reais de isolamento) · memória do projeto: "sem RLS no banco — isolamento em código".
- **Evidência:** Nenhuma das tabelas com `tenantId` (`Student`, `Enrollment`, `Payment`, `Coupon`, `Course`/`TenantCourse`, `Lead`, `Certificate`, `StudentNote`, etc.) tem `ENABLE ROW LEVEL SECURITY` + policy escopada por tenant. O único controle de vazamento cross-tenant é o `where: { tenantId }` aplicado manualmente em cada query. A auditoria confirmou que os 280 route handlers HOJE derivam o tenant da sessão (`requireResellerSession`/`requireStudentSession` — `src/lib/auth/reseller-session.ts`, `student-session.ts`) e que NENHUM lê `tenantId` de body/query (grep negativo). Ou seja: o código atual está correto, mas a invariante "toda query filtra por tenant" depende inteiramente de revisão humana a cada novo handler.
- **Impacto:** Um único `findMany`/`findFirst` futuro sem `where: { tenantId }` (ou um `findUnique` por id sem checagem de posse) vaza dados entre revendas — vazamento cross-tenant é P0 por definição da rubrica. Sem RLS não há contenção: o erro vira incidente direto. O risco cresce com a ⚠️MIGRAÇÃO p/ Postgres self-hosted (mais superfícies de acesso direto ao banco: jobs, psql, ferramentas internas) onde a app deixa de ser o único caminho até os dados.
- **Correção:** (a) Como mitigação imediata e barata, criar um **teste de isolamento de tenant** automatizado (ver Verificação) que, para cada model com `tenantId`, exercita um handler representativo com sessão do tenant A pedindo recurso do tenant B e exige 403/404/vazio — rodar no CI. (b) Roadmap de RLS: habilitar `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` nas tabelas com `tenantId`, com policy que case o tenant via claim/`set_config('app.tenant_id', ...)` por request (Prisma `$executeRaw` de `SET LOCAL` no início da transação). Decisão arquitetural — o `corretor` deve PARAR e descrever a (b) ao usuário antes de aplicar, pois muda o modelo de acesso ao banco e exige Supavisor/pgBouncer compatível com `SET LOCAL`. (a) pode ser feito sem aprovação.
- **Verificação:** `npm test -- tenant-isolation` (novo) verde; manualmente: logar como revenda A, chamar `GET /api/painel/alunos/<id-de-aluno-da-revenda-B>` → deve retornar 404; repetir para `cupons`, `certificates`, `financeiro`, `vendas`. Se RLS for adotada: `SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname IN (<tabelas com tenantId>)` deve mostrar `t` em ambas as colunas.

### [SEG-002] CSP usa `script-src 'unsafe-inline' 'unsafe-eval'` — reduz proteção a XSS
- **Severidade:** P2
- **Status:** Aberto
- **Local:** `next.config.ts:32` (`"script-src 'self' 'unsafe-inline' 'unsafe-eval' https://sdk.mercadopago.com ..."`) e `:31` (`style-src 'self' 'unsafe-inline'`).
- **Evidência:** A política permite execução de qualquer `<script>` inline e `eval()`. Embora não haja XSS reflexivo identificado (os `dangerouslySetInnerHTML` em `src/components/shared/tracking-pixels.tsx:29` e `tracking-purchase-event.tsx:33` usam snippets templated com IDs validados por Zod + `JSON.stringify` escapado em `src/lib/tracking/snippets.ts` — seguro; os de `json-ld.tsx`/FAQ schema são `JSON.stringify` de config estática — seguros), `'unsafe-inline'`/`'unsafe-eval'` removem a principal mitigação caso uma XSS surja no futuro.
- **Impacto:** Se um XSS for introduzido (ex.: novo `dangerouslySetInnerHTML` com input de usuário, ou lib comprometida), a CSP não conterá o ataque — execução de script arbitrário no contexto da vitrine/painel, com risco de roubo de sessão (apesar do cookie `httpOnly`, há tokens em `sessionStorage` e a flag de impersonation `httpOnly:false` em `impersonate/route.ts:103`).
- **Correção:** Migrar para CSP baseada em **nonce**: gerar um nonce por request (no `proxy.ts`/middleware), injetar `script-src 'self' 'nonce-<n>' https://sdk.mercadopago.com ...` e aplicar o nonce aos `<Script>` do next/script. Remover `'unsafe-eval'` (verificar se o SDK do Mercado Pago exige `eval` — se sim, isolar num iframe sandbox). Como o app já centraliza os snippets em `snippets.ts`, dá para anexar o nonce ali. Manter `style-src 'unsafe-inline'` só se o Tailwind/shadcn exigir (comum), ou migrar para hashes.
- **Verificação:** `curl -sI https://profissionalizamaisbrasil.com.br | grep -i content-security-policy` não deve conter `'unsafe-inline'`/`'unsafe-eval'` em `script-src`; smoke test manual do checkout MP (Payment Brick) e do editor de certificado (iframe blob) continua funcionando.

### [SEG-003] Dependências com vulnerabilidade ALTA: `xlsx` (prototype pollution + ReDoS) sem patch upstream
- **Severidade:** P2
- **Status:** Aberto
- **Local:** `package.json:59` (`"xlsx": "^0.18.5"`), usado em `src/components/admin/report-viewer.tsx:102-107`. Confirmado por `npm audit --omit=dev`.
- **Evidência:** `npm audit` reporta `xlsx *` HIGH — "Prototype Pollution in sheetJS" (GHSA-4r6h-8v6p-xvw6) + "ReDoS" (GHSA-5pgg-2g8v-p4x9), **sem fix disponível** no registry npm (a versão corrigida só é distribuída pelo CDN da SheetJS). O uso atual é apenas **escrita** (`XLSX.write` / `aoa_to_sheet` sobre dados gerados pelo admin) — `XLSX.read`/parse de arquivo não-confiável NÃO é usado, o que reduz muito a exploitabilidade prática (os vetores exigem parsear planilha maliciosa).
- **Impacto:** Hoje, baixo na prática (sem parsing de upload). Mas é uma HIGH aberta no inventário de supply-chain; se algum dia o app passar a importar planilhas de usuário (ex.: import de alunos via .xlsx), torna-se explorável (poluição de protótipo → potencial RCE/escalada; ReDoS → DoS).
- **Correção:** Trocar `xlsx` do npm pela distribuição oficial corrigida da SheetJS (`https://cdn.sheetjs.com/xlsx-latest/xlsx-latest.tgz`) atualizando o `package.json`/lockfile, OU substituir por `exceljs` (que recebe patches no npm) já que o uso é só export. Enquanto isso, NUNCA usar `XLSX.read` sobre conteúdo de usuário. Documentar a decisão.
- **Verificação:** `npm audit --omit=dev` não lista mais `xlsx` HIGH; export de relatório em `/admin/relatorios/[type]` continua gerando .xlsx válido.

### [SEG-004] `mercadopago` (npm) é dependência direta não-usada e arrasta `uuid` vulnerável
- **Severidade:** P3
- **Status:** Aberto
- **Local:** `package.json:41` (`"mercadopago": "^2.12.0"`). Confirmado: `grep -rln "from \"mercadopago\"" src` → vazio (a integração MP usa cliente próprio em `src/lib/mercadopago/client.ts` via `fetch`).
- **Evidência:** `npm audit` aponta `mercadopago 1.0.0-3.0.0 → uuid v3/v5/v6` (GHSA-w5hq-g745-h8pq, moderate). O pacote SDK não é importado em lugar nenhum do `src/` — é peso morto que só infla a árvore de deps e a superfície de auditoria.
- **Impacto:** Aumenta superfície de supply-chain sem benefício; o `uuid` vulnerável vem só por esse pacote. Sem impacto direto em runtime (código morto), mas viola higiene de dependências.
- **Correção:** Remover `mercadopago` do `package.json` (`npm rm mercadopago`) e do lockfile, confirmando que nada importa o SDK. Rodar o Portão Zero-Erro.
- **Verificação:** `npm ls mercadopago` → "not found"; `npm audit --omit=dev` não lista mais o subtree `uuid` via mercadopago; `npx tsc --noEmit` + `next build` verdes.

### [SEG-005] Sem Dependabot/Renovate — sem atualização contínua de dependências
- **Severidade:** P3
- **Status:** Aberto
- **Local:** ausência de `.github/dependabot.yml` / `renovate.json` (confirmado: `ls` → NONE).
- **Evidência:** Não há automação de bump de dependências. As 14 vulnerabilidades atuais (11 moderate, 3 high) ficam invisíveis até alguém rodar `npm audit` manualmente.
- **Impacto:** Vulnerabilidades de libs (auth/crypto/email/Next) podem permanecer abertas por longos períodos sem visibilidade. ⚠️MIGRAÇÃO: na VPS sem o radar da Vercel, isso fica ainda mais relevante.
- **Correção:** Adicionar `.github/dependabot.yml` (ecosystem `npm`, schedule weekly, agrupando dev-deps) OU `renovate.json`. Idealmente também um job `npm audit --omit=dev --audit-level=high` que falhe o CI em HIGH/CRITICAL novas.
- **Verificação:** PR automático do Dependabot aparece no repositório; o job de audit no CI roda no `ci.yml`.

### [SEG-006] Verificação manual: confirmar segredos críticos setados em produção (Vercel) — e plano de rotação
- **Severidade:** P3
- **Status:** Aberto
- **Local:** `src/lib/env.ts:81-86,178-201` (envs `requiredInProd`/warnings) — não auditável a partir do repo (env de produção).
- **Evidência:** O código já fail-fasta no boot quando faltam `AUTH_SECRET`, `ENCRYPTION_KEY`, `CRON_SECRET`, `INTERNAL_SECRET`, `ASAAS_WEBHOOK_TOKEN`, `EA_*`, `ASAAS_*` (via `assertEnv`/`requiredInProd`). `MP_WEBHOOK_SECRET` e Upstash apenas emitem **warning** (degradam features). A memória do projeto registra blocker ABERTO: "`MP_WEBHOOK_SECRET` ausente no Vercel impede fulfillment da venda MP da vitrine PMB".
- **Impacto:** Se `MP_WEBHOOK_SECRET` estiver ausente em prod, vendas da vitrine PMB (tenantId=null) não recebem matrícula automática (webhook rejeitado em `src/lib/mercadopago/process.ts:295`). Se `UPSTASH_REDIS_REST_*` faltarem, rate-limit fica DESLIGADO (buckets não-failOpen negam em prod, mas auth libera) e o cache de tenant cai no fallback. Não há plano documentado de rotação de `ENCRYPTION_KEY` (rotacioná-la quebraria a leitura de `mp_access_token`/`asaas*` já cifrados — exige re-cifragem).
- **Correção:** (manual, ação do usuário) Confirmar no painel Vercel que estão setados: `MP_WEBHOOK_SECRET`, `UPSTASH_REDIS_REST_URL`/`TOKEN`, `LMS_API_URL`/`LMS_API_KEY` (pendente por CLAUDE.md), além dos `requiredInProd`. Documentar em `docs/` um runbook de **rotação de chaves** — em especial que rotacionar `ENCRYPTION_KEY` exige migration de re-cifragem dos campos `Tenant.mpAccessToken`/`asaasApiKey`/`asaasWebhookToken`/`mpWebhookSecret` (suportar 2 chaves durante a transição).
- **Verificação:** `vercel env ls production` mostra as chaves; após deploy, `GET /api/health` ok e uma venda de teste na vitrine PMB matricula automaticamente (webhook processed=true).

## Cobertura

**Isolamento multi-tenant (ref §1):**
- 280 route handlers revisados quanto a derivação de tenant: `painel/**` (82) usam `requireResellerSession`/`requireResellerOwner`/`requireResellerMember` → tenant da sessão; `aluno/**` (9) e `student/**` (2) usam `requireStudentSession` + checagem de posse (`where:{id,studentId}` em `aluno/curso/[enrollmentId]/acessar`, `cert.studentId !== session.studentId` em `student/certificates/[id]/download`); `loja/**` (11) usam header `x-tenant-id` setado pelo proxy (sanitizado em `proxy.ts:244-246`). **Nenhum handler lê `tenantId` de body/query** (grep negativo). RLS: **Achado SEG-001** (ausente como modelo de isolamento).
- `using (true)`/`with check (true)`: **N/A** — não há policies de tenant; a única policy é `deny_anon` (fail-closed), OK.

**Chaves Supabase / superfície de cliente (ref §2):** OK — `SUPABASE_SERVICE_ROLE_KEY` só em `src/lib/certificates/storage.ts` e `src/lib/supabase/storage.ts` (server-only, sem `"use client"`); zero `NEXT_PUBLIC_*` com nome de segredo; `anon`/service nunca no bundle client.

**Autenticação (ref §3):** OK — NextAuth v5 (`src/lib/auth.ts`), JWT validado server-side via `auth()` (equivalente ao `getUser()`; **nenhum `getSession()`** no repo). Layouts `admin`/`painel`/`aluno` checam auth no RSC com `redirect`. Cookies `httpOnly`+`secure`(prod)+`sameSite=lax` (`auth.ts:149-159`). JWT re-sincroniza papel/status a cada 60s e desloga user inativo (`auth.ts:314-338`). `matcher` do proxy não protege rotas privadas — a proteção está nos layouts/handlers (modelo válido).

**Autorização (ref §4):** OK — guards centralizados em `src/lib/auth/guards.ts`/`scope.ts`/`roles.ts`. `api/admin/**` (126): só `end-impersonation` sem `auth()` (por design — restaura de cookie HMAC-assinado, `impersonate.ts:106-121`). Páginas admin sensíveis re-checam papel específico (`/admin/equipe` → SUPER_ADMIN; `/admin/vendas/cupons` → SUPER_ADMIN|PMB_SALES; `/admin/indicacoes/saques` → finance roles). Cap de desconto do consultor validado server-side via lookup `TenantMember.maxDiscount` em `painel/vendas/route.ts:174-186` e `painel/cupons/route.ts:89-110`. `requireResellerOwner` bloqueia consultor de elevar o próprio cap (`guards.ts:124-128`). Impersonation SUPER_ADMIN-only com audit log (`impersonate/route.ts:28-34,110-119`).

**Validação de entrada (ref §5):** OK — Zod nos boundaries (login `auth.ts:19`, todos os públicos: `revendedores/cadastro`, `pmb/leads`, `contato`, `leads`, `public/capture-ref`, `loja/cupom`, `cobranca/pay-card`, `painel/*`). **SSRF: N/A** — todo `fetch` usa base-URL fixa de env (`VERCEL_API`, `MP_BASE_URL`, `EA_API_URL`, `ASAAS_API_URL`); nenhum host vem do usuário; sem proxy de imagem por URL. **XSS:** `dangerouslySetInnerHTML` só em snippets templated seguros (ver SEG-002). **SQLi: N/A** — Prisma parametrizado; sem `$queryRawUnsafe`/template-string com input.

**Segredos (ref §6):** OK — `.env*` no `.gitignore`; só `.env.example` tracked (valores vazios/placeholder); `.mcp.json` gitignored e não-tracked; histórico git sem segredos reais (só nomes de var). Rotação: **Achado SEG-006**.

**Headers/borda (ref §7):** Parcial — `next.config.ts:7-42` tem HSTS, X-Content-Type-Options, X-Frame-Options=DENY, Referrer-Policy, Permissions-Policy, CSP com `frame-ancestors 'none'`/`object-src 'none'`/`base-uri 'self'`. CSP fraca em script-src: **Achado SEG-002**. Rate-limit em login/forgot/reset/checkout/leads/cupom/cadastro/upload/track (`ratelimit.ts:180-200`) — failOpen só em auth/track (correto). CSRF: Server Actions nativas; route handlers de mutação são JSON (não form cross-origin) + cookie sameSite=lax. Webhooks com assinatura (Asaas token timing-safe `webhooks/asaas/route.ts:51-56,104`, MP HMAC `mercadopago/webhook.ts:65-68` + exige x-signature em prod `route.ts:52-55`); dev-bypass barrado em prod (`process.ts:289-292`). Crons: 13/13 com `isCronAuthorized` (CRON_SECRET timing-safe). Resolve-tenant interno protegido por `x-internal-secret` + rate-limit.

**Dependências (ref §8):** Achados SEG-003 (xlsx HIGH), SEG-004 (mercadopago→uuid), SEG-005 (sem Dependabot). `hono` HIGH é **N/A** (só dev: prisma devtools + shadcn CLI, fora do bundle de runtime). `nodemailer@7.0.13` (HIGH no audit) está na **versão mais recente publicada** e só recebe config/destinatários controlados pela app (host SMTP de env; `to`/`from` app-controlled) — sem patch upstream disponível e sem vetor de input de usuário; monitorar.

**Itens N/A:** RLS policy-by-policy (não há — coberto por SEG-001 e pelo domínio `banco`); Server Actions (2: `inadimplente`, `validar` — páginas públicas read-only, sem mutação sensível); CORS de API pública (não há `Access-Control-Allow-Origin: *` com credentials no repo).
