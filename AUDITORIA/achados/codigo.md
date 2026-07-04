# Auditoria — Código / Arquitetura
_Data: 2026-07-03 · Referência: .claude/skills/auditoria-saas/references/03-codigo-arquitetura.md · Itens do inventário cobertos: 309 route handlers / 342 componentes / 251 módulos lib (720 exports) — sem amostragem_

Re-verificação da rodada de 2026-06-24 + varredura do delta (~45 commits, 237 arquivos, +13k linhas:
BI hub `src/lib/reports`+`src/components/reports`, sync LMS, parcelamento MP `getInstallments`, placar,
tours guiados, menu recolhível, edição em massa sequencial).

## Resumo
- Itens verificados: 909 (handlers+componentes+libs) · Achados: **P0=0 · P1=0 · P2=1 · P3=4** (+1 P2 Aceito) · **Nota do domínio: 8.8/10**

## Portão Zero-Erro (medido nesta rodada)
| Etapa | Comando | Resultado |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | **PASSOU — exit 0, ZERO erro de tipo** |
| Lint | `npx eslint src` | **PASSOU — exit 0, 0 erros** |
| Testes | `npx vitest run` | **PASSOU — 53 arquivos / 328 testes verdes (2.98s)** |
| Build | `next build` | **NÃO EXECUTADO localmente** — `npm run build` encadeia `db:apply-pending` (toca prod); roda no CI (`ci.yml`) com `SKIP_PENDING_MIGRATIONS=1` + `DATABASE_URL` dummy (COD-002 permanece fechado). |

Saúde estrutural (evidência): **zero** `:any`/`as any`/`@ts-ignore`/`@ts-expect-error` em `src/` (grep vazio);
`tsconfig strict:true`; **zero** componente `"use client"` importando `@/lib/{prisma,crypto,asaas/client,mercadopago/client,lms/client,email/*}`;
**zero** `new PrismaClient` fora de `lib/prisma.ts`; Supabase centralizado; error boundaries cobrindo todos os 5 grupos de rota
(`error.tsx` ×5, `global-error.tsx` ×1, `not-found.tsx` ×6); **zero** `$transaction([...])` em lote (gotcha do pooler já eliminado, edição em massa é sequencial);
16 non-null assertions, todas guardadas por checagem prévia. BI hub novo (admin+painel) com isolamento multi-tenant real (ver Cobertura).

### Status das findings de 2026-06-24
| ID | Estado hoje | Nota |
|---|---|---|
| COD-001 (LMS env fora do schema) | **CORRIGIDO** (mantém) | `LMS_API_URL`/`LMS_API_KEY` no `envSchema`. |
| COD-002 (CI sem build) | **CORRIGIDO** (mantém) | step Build no `ci.yml`. |
| COD-003 (process.env espalhado) | **CORRIGIDO** (2026-07-03) | 8 envs migrados p/ `envSchema` + `env.*`: PMB_MP_PUBLIC_KEY, PMB_SUPPORT_EMAIL, PLACAR_META, 4× *_RETENTION_DAYS (+ WA_* já feitos). Framework/Edge (NEXT_RUNTIME/PHASE, VERCEL_ENV/APEX_IP, NEXT_PUBLIC_*) mantidos como process.env por design. Setup de teste `src/test/setup-env.ts` para env de import-time. |
| COD-004 (ciclos de módulo) | **ABERTO — PIOROU** | madge: 8 → **9** ciclos. |
| COD-005 (exports mortos) | **RE-ABERTO** | Cluster novo de ~20 exports mortos (7 componentes `loja/`, 4 guards, 2 forms, helpers). |
| COD-006 (`.catch(()=>{})` financeiro) | **QUASE FECHADO** | referrals/asaas/dispatch migraram p/ `swallow()`; restam **2** sites best-effort de baixo impacto. |
| COD-007 (createReseller não-atômico) | **ABERTO — Aceito** | inalterado (`create.ts` sem `$transaction` envolvendo tenant+user). |
| COD-008 (acoplamento Vercel / sem standalone) | **ABERTO** | inalterado ⚠️MIGRAÇÃO. |

---

## Achados

### [COD-003] 60 arquivos leem `process.env` direto; 5 envs escapam 100% da validação Zod ⚠️MIGRAÇÃO
- **Severidade:** P2
- **Status:** Corrigido (2026-07-03)
- **Verificação (2026-07-03):** `envSchema` agora declara PMB_MP_PUBLIC_KEY, PMB_SUPPORT_EMAIL, PLACAR_META e os 4 `*_RETENTION_DAYS` (via helpers `optionalInt()`/`optionalEmail()` tolerantes a "" — não introduzem novo fail-fast onde não havia). Leituras trocadas por `env.*` em `pmb-config.ts`, `support/student-support.ts`, `placar/snapshot.ts`, `cron/sweep-stale-pii`, `cron/cleanup-email-logs`. `grep process.env.<alvo>` fora de env.ts → vazio. `.env.example` documenta as novas chaves. Envs framework/Edge (NEXT_RUNTIME/PHASE, VERCEL_ENV/APEX_IP, NEXT_PUBLIC_*, MP_WEBHOOK_DEV_BYPASS guardado por NODE_ENV) mantidos como `process.env` por design (urls.ts é bundlado no client; proxy/instrumentation rodam no Edge/boot). Novo `src/test/setup-env.ts` (setupFiles no vitest) define `DATABASE_URL` dummy antes dos imports — cobre módulos que leem `env.X` em nível de módulo. Portão: typecheck 0 · lint 0 · 567 testes verdes · build OK (`SKIP_PENDING_MIGRATIONS=1`).
- **Local:** 60 arquivos (`grep -rln "process\.env\." src --include=*.ts --include=*.tsx | grep -v env.ts | grep -v .test.`). Envs **ausentes do `envSchema`** (`src/lib/env.ts`): `PMB_SUPPORT_EMAIL` (`src/lib/support/student-support.ts:13-15`), `PLACAR_META` (`src/lib/placar/snapshot.ts:19`), `PMB_MP_PUBLIC_KEY`, `WA_GATEWAY_API_KEY` + `WA_GATEWAY_URL` (automação WhatsApp). Persistentes: `asaas/client.ts`, `mercadopago/client.ts`, `lms/client.ts`, `pmb-config.ts`, `resellers/create.ts`, `branding.ts`, `system-settings.ts`, `redis.ts`, `ratelimit.ts`, `proxy.ts`.
- **Evidência:** diff automático entre `process.env.X` referenciados e chaves declaradas em `env.ts` → `NOT in schema: PLACAR_META, PMB_MP_PUBLIC_KEY, PMB_SUPPORT_EMAIL, WA_GATEWAY_API_KEY, WA_GATEWAY_URL` (`MP_WEBHOOK_DEV_BYPASS` também escapa, mas está guardado por `NODE_ENV !== "production"` em `mercadopago/process.ts:293-296` — OK). `env.ts:16` documenta a convenção "NÃO leia process.env.X diretamente em código novo". `WA_GATEWAY_URL`/`_API_KEY` e `PMB_MP_PUBLIC_KEY` são integrações funcionalmente críticas: se faltar/typo, a automação de WhatsApp e o checkout PMB caem silenciosamente sem o app falhar cedo no boot.
- **Impacto:** baixo em runtime hoje; dívida de validação + migração. A fonte-de-verdade de segredos está fragmentada — o checklist de secrets do Docker Swarm (⚠️MIGRAÇÃO, enumera todo segredo a injetar) não tem lista canônica. 5 envs fora do schema = 5 pontos que não falham cedo (item 4.5 da referência).
- **Correção:**
  1. Declarar no `envSchema` (`src/lib/env.ts`): `PMB_SUPPORT_EMAIL: z.string().email().optional()`, `PLACAR_META: z.coerce.number().int().positive().optional()`, `PMB_MP_PUBLIC_KEY: z.string().optional()`, `WA_GATEWAY_URL: z.string().url().optional()`, `WA_GATEWAY_API_KEY: z.string().optional()`. Trocar cada leitura direta por `env.X` (`student-support.ts:13`, `placar/snapshot.ts:19`, automação WA, `pmb-config.ts`).
  2. Migração incremental por arquivo dos clients de integração (`asaas/client.ts`, `mercadopago/client.ts`, `lms/client.ts`, `resellers/create.ts`): declarar a env (se faltar) e trocar `process.env.X` → `env.X`. Manter `process.env` só em `proxy.ts`/`redis.ts`/`ratelimit.ts`/`instrumentation.ts` (rodam no Edge/boot antes do proxy lazy de `env`) — documentar a exceção em comentário.
- **Verificação:** `grep -E "PMB_SUPPORT_EMAIL|PLACAR_META|PMB_MP_PUBLIC_KEY|WA_GATEWAY" src/lib/env.ts` retorna 5 linhas; o diff `used_env` vs `declared_env` fica vazio (exceto `MP_WEBHOOK_DEV_BYPASS`/`NODE_ENV`); `npx tsc --noEmit` verde.

### [COD-005] ~20 exports mortos (código morto) — 7 componentes `loja/`, 4 guards, 2 forms, helpers
- **Severidade:** P3
- **Status:** Aberto (re-aberto; a rodada de 2026-06-24 fechou só 2 exports, o cluster atual é maior)
- **Local (zero importadores, confirmado por grep de import-path):**
  - Componentes `loja/` órfãos: `src/components/loja/breadcrumb.tsx` (`Breadcrumb`), `category-pills.tsx` (`CategoryPills`), `course-description.tsx` (`CourseDescription`), `course-stats.tsx` (`CourseStats`), `hero-banner.tsx` (`HeroBanner` — o usado é `components/main/home/hero-banner.tsx`), `lesson-accordion.tsx` (`LessonAccordion`), `price-display.tsx` (`PriceDisplay`).
  - Guards nunca chamados: `src/lib/auth/guards.ts` → `requirePmbFinanceiro` (:21), `requireRevendaTeam` (:93), `requirePmbSalesMgr` (:101), `requireResellerMember` (:162).
  - UI forms: `src/components/painel/course-list-toolbar.tsx` (`CourseListToolbar`), `src/components/painel/referral-payout-form.tsx` (`ReferralPayoutForm`).
  - Helpers de lib: `src/lib/catalog/home.ts` (`loadCurated` :102, `loadByCategoria` :141), `src/lib/catalog/eja.ts` (`loadPmbEjaConfig` :78), `src/lib/tenant/current.ts` (`requireCurrentTenant` :89), `src/lib/tenant/checkout-mode.ts` (`canResellerCheckout` :50), `src/lib/tenant/courses.ts` (`listTenantCategories` :378), `src/lib/storage/payout-proof.ts` (`deletePayoutProof` :72), `src/lib/referrals/monthly.ts` (`previousPeriod` :69), `src/lib/mercadopago/client.ts` (`getPreapproval` :213), `src/lib/asaas/client.ts` (`listSubscriptions` :236).
- **Evidência:** `npx ts-prune` + verificação manual por import-path (`grep -rln "loja/<f>" src | grep -v <arquivo>` → 0 para cada; `grep -rln "requirePmbFinanceiro" src | grep -v guards.ts` → 0; idem demais). NÃO incluídos (biblioteca de superfície de API intencional, manter): `plataforma-cursos/client.ts` (wrappers completos da API parceira), `mercadopago/utils.ts` (`parseMpNotification`/`isPaymentNotification`/`isPreapprovalNotification`).
- **Impacto:** ruído de manutenção e bundle; risco de "corrigir bug no arquivo errado" (ex.: dois `hero-banner`/`PriceDisplay` — um vivo, um morto). Componentes `loja/` mortos podem mascarar telas migradas para `components/main`.
- **Correção:** remover os arquivos `loja/` órfãos e os 4 guards não usados + `course-list-toolbar.tsx` + `referral-payout-form.tsx`; remover os helpers de lib mortos (ou marcar `@internal` se forem API pública planejada). Rodar `npx tsc --noEmit` + `npx eslint` após cada remoção. Considerar `no-unused-exports` no ESLint p/ travar regressão.
- **Verificação:** `npx ts-prune | grep -E "loja/(breadcrumb|category-pills|course-description|course-stats|hero-banner|lesson-accordion|price-display)"` vazio; `grep -rn "requirePmbFinanceiro\|requireRevendaTeam\|requirePmbSalesMgr\|requireResellerMember" src | grep -v guards.ts` vazio; Portão verde.

### [COD-006] 2 `.catch(() => {})` best-effort residuais (cache-invalidation + stop-session)
- **Severidade:** P3
- **Status:** Aberto (rebaixado de P2 — os 9 sites financeiros/audit de 2026-06-24 já migraram para `swallow()`)
- **Local:** `src/app/api/painel/config/sales-gateway/route.ts:100` (`invalidateTenant(...).catch(() => {})` após trocar `salesGateway`) · `src/app/api/admin/automacao/whatsapp/status/route.ts:72` (`stopSession(...).catch(() => {})` no ramo de recuperação P2002).
- **Evidência:** grep `\.catch\(\(\) *=> *\{\}\)` em `src/lib/{referrals,asaas,automation}` → **vazio** (todos usam `.catch(swallow("<contexto>"))`, 115 sites). Os demais `.catch(() => {})` restantes são client-side DOM/telemetria legítimos (`placar-client.tsx`, `pre-live-video.tsx` — `play()`/`fullscreen`; `logger-client.ts`; `lead-detail-drawer.tsx` fetch de UI; `after-response.ts` — documentado e `fn` trata os próprios erros). Sobram só os 2 acima: invalidar cache de tenant falhando em silêncio pode servir gateway/dado stale; `stopSession` best-effort perde o log de por que a sessão WA não parou.
- **Impacto:** baixo — cache stale de curta duração (TTL 5min) e ruído de debug em falha de stop de sessão WhatsApp. Sem toque em dinheiro.
- **Correção:** trocar por `.catch(swallow("painel.sales_gateway.invalidate"))` e `.catch(swallow("automacao.whatsapp.stop_session"))` (importar de `@/lib/errors`).
- **Verificação:** `grep -rnE "\.catch\(\(\) *=> *\{\}\)" src/app/api/painel/config/sales-gateway src/app/api/admin/automacao/whatsapp/status` → vazio; `npx tsc --noEmit` verde.

### [COD-007] `createReseller` não é atômico: Asaas + Tenant + User em writes separados → órfãos em falha
- **Severidade:** P2
- **Status:** Aceito (risco assumido — decisão do dono; registrado para rastreio)
- **Local:** `src/lib/resellers/create.ts` → `createSubscription` (:168) ANTES de `prisma.tenant.create` (:200) e `prisma.user.create` (:304); sem `prisma.$transaction` nem compensação (cancelar assinatura). Caminho idêntico em `src/app/api/revendedores/cadastro/route.ts` (self-signup) e `src/app/api/painel/revendas/route.ts` (sub-revenda).
- **Evidência:** grep confirma a ordem: `createSubscription` (Asaas) → `tenant.create` → `user.create`, três writes soltos. Falha de DB entre `:200` e `:304` deixa (a) assinatura Asaas cobrando sem tenant, ou (b) tenant sem owner (revenda inacessível).
- **Impacto:** raro, mas financeiro quando ocorre; recuperação manual (reconciliação Asaas↔Tenant já existe no painel, o que reduz gravidade). Conhecido e aceito (lote-ajustes-junho).
- **Correção (se endereçar):** envolver `tenant.create` + `user.create` em `prisma.$transaction`; no `catch` do DB, cancelar a assinatura Asaas recém-criada (`cancelSubscription(asaasSubscriptionId)`) e propagar. Side-effects (branding/vitrine/templates) ficam best-effort pós-commit. **Atenção:** usar `prisma.$transaction(async (tx) => {...})` (callback), NÃO o array `$transaction([...])` — o array quebra sobre o pooler Supabase (gotcha já documentado no projeto).
- **Verificação:** teste de integração simulando falha no `user.create` asseverando que nenhum `Tenant` persiste (ou que a assinatura é cancelada); `npx tsc --noEmit` verde.

### [COD-004] 9 dependências circulares no grafo de módulos (8 type-only, 1 mista)
- **Severidade:** P3
- **Status:** Aberto (piorou: 8 → 9)
- **Local:** `npx madge --circular --extensions ts,tsx src/`: (1-3) `checkout-wizard.tsx ↔ {checkout-form-empresa, checkout-form-pessoal, checkout-payment-preview}`; (4) `account-form.tsx ↔ config-tabs.tsx`; (5-6) `config-tabs → billing-section → asaas-gateway-section` / `→ billing-section`; (7-8) `lead-detail-drawer → lead-kanban-column → leads-kanban-board` (**mista** — valor `STAGE_META`); (9 **novo**) `lib/certificates/templates/classic.tsx ↔ info-page.tsx`.
- **Evidência:** madge processou 1137 arquivos → "9 circular dependencies". 8 são type-only (apagados na compilação); o ciclo dos leads mistura valor (`STAGE_META`) → único com risco teórico de TDZ.
- **Impacto:** nenhum erro hoje; risco organizacional + o ciclo com `STAGE_META` pode dar `undefined` em hot-reload/tree-shaking agressivo.
- **Correção:** extrair tipos compartilhados para `*.types.ts` neutros; mover `STAGE_META` para `lead-kanban.shared.ts`; em `certificates/templates`, extrair o tipo comum entre `classic` e `info-page` para um módulo neutro; filhos importam do neutro em vez do pai.
- **Verificação:** `npx madge --circular --extensions ts,tsx src/` → "No circular dependency found".

### [COD-008] Config acoplada à Vercel; sem `output:'standalone'`; `@upstash/redis` REST ⚠️MIGRAÇÃO
- **Severidade:** P3
- **Status:** Aberto
- **Local:** `next.config.ts` (sem `output:"standalone"`; `images.unoptimized:true` :64; CSP `connect-src ... https://*.upstash.io https://vitals.vercel-insights.com` :35; `script-src ... https://va.vercel-scripts.com` :34) · `@upstash/redis` REST em `src/lib/redis.ts` + `src/lib/ratelimit.ts` · `@vercel/analytics`+`@vercel/speed-insights` no `package.json`.
- **Evidência:** grep confirma ausência de `output`/`standalone`, `unoptimized:true`, e os 3 domínios Vercel/Upstash na CSP; `@upstash/redis` importado em 2 consumidores. Na VPS (Docker Swarm) o Redis vira TCP — o cliente REST `@upstash/redis` **não** fala TCP; sem `output:"standalone"` o Dockerfile não produz o bundle mínimo; `*.vercel-insights`/`va.vercel-scripts` ficam mortos.
- **Impacto:** nenhum em produção Vercel hoje; é o pacote de migração. Sem o flag o container fica gordo/quebrado; a CSP precisa ser reescrita para os domínios self-hosted (MinIO `s3.bmbr.com.br` já está em `img-src`).
- **Correção (só na migração — NÃO aplicar em Vercel):** adicionar `output:"standalone"`; trocar `@upstash/redis` por `ioredis`/`redis` TCP em `redis.ts`/`ratelimit.ts` (e cobrir o path do proxy); remover `*.upstash.io`/`vitals.vercel-insights.com`/`va.vercel-scripts.com` da CSP; remover/substituir `@vercel/analytics`+`speed-insights`; revisar `images.unoptimized` com CDN próprio.
- **Verificação:** pós-migração, `grep -n "standalone" next.config.ts` retorna 1; `grep -rn "@upstash/redis" src/` vazio; CSP sem domínios Vercel/Upstash.

## Cobertura
- **309 route handlers / 406 métodos:** varredura de boundary (auth/secret/prisma em client → **zero** leaks), padrão de erro (try/catch; `.catch(() => null)` legítimo em parse de body e fallbacks de QR/billing/installments — 52 sites, todos de degradação graciosa), Zod nos recém-criados. Delta auditado a fundo: `relatorios/bi/[tab]` (admin) → `requireAdminSession` + `canViewTab(role,tab)` (**OK**); `painel/relatorios/bi/[tab]` → `requireResellerSession` + `ctx.tenantId` como âncora + `canViewPainelTab(tab,isOwner)` (**OK, isolamento P0 real**); `aluno/comprar/installments` → Zod + tenant-por-sessão + degradação p/ síntese, nunca derruba a tela (**OK**). **OK** salvo COD-006 (sales-gateway, automacao/whatsapp/status).
- **BI modules (`src/lib/reports/{bi,painel}`):** todos os módulos do painel filtram por `tenantId` (financeiro/alunos/receita/cursos-cupons/indicacoes: refs de `tenantId` ≥ nº de queries). O único `$queryRaw` (`painel/financeiro.ts:30`) é **tagged template parametrizado** (`WHERE tenant_id = ${tenantId}`, `paid_at >= ${mrrStart}`) — sem interpolação de string, sem injeção, tenant-scoped → **OK**.
- **251 módulos lib / 720 exports:** ts-prune + verificação de import-path (mortos → COD-005) + madge (ciclos → COD-004) + grep type-safety (**zero** any). `after-response.ts`, `errors.ts/swallow`, `logger*`, `reports/payload.ts` (envelope `ReportPayload` neutro admin+painel) → **OK**.
- **342 componentes:** boundary-leak (prisma/crypto/secrets/clients em `"use client"` → **zero**). Barrel de charts (`components/reports/charts/index.tsx`) usa `dynamic(ssr:false)` por card com `as ComponentType<ChartCardProps>` (cast padrão de `next/dynamic`, não `as any`) + `SeriesChart` genérico por `kind` → **OK**. Client components de delta (placar, pre-live-video, tours, menu recolhível) sem leak → **OK**.
- **Server Actions (`"use server"`):** 3 arquivos, diretiva correta → **OK**.
- **App Router specials:** `error.tsx` ×5 (root, admin, aluno, loja, painel), `global-error.tsx` ×1, `not-found.tsx` ×6, `loading.tsx` ×5; sem `template.tsx`/`default.tsx` (N/A) → **OK**.
- **tsconfig:** `strict:true` → **OK**. **Lint/format:** ESLint 0 erros; **zero** `console.log`; `MP_WEBHOOK_DEV_BYPASS` guardado por `NODE_ENV` → **OK**.
- **Boot/env:** `assertEnv()` via `instrumentation.ts` fail-fast em prod → **OK** com gap (5 envs fora do schema → COD-003).
- ⚠️MIGRAÇÃO (COD-008): sem `output:"standalone"`; `@upstash/redis` REST (`redis.ts`/`ratelimit.ts`); CSP com `*.upstash.io`+`*.vercel-insights`+`va.vercel-scripts`; `@vercel/analytics`+`speed-insights`; Edge runtime do proxy não existe no Swarm (fallback de DB cobre).
