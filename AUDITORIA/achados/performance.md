# Achados — Domínio: performance
_Auditor read-only · 2026-06-24 (re-verificação do relatório de 2026-06-20) · Nota do domínio: **6/10** · P0=0 · P1=2 · P2=7 · P3=3_

> **Resiliência a outage do Redis (fix `dcd03fd`): mantém-se OK.** Todo `redis.*()` em try/catch;
> `runLimit`/`rateLimit` captura falha de comando; proxy fail-open; `resolve-tenant` `failOpen:true`;
> health/sync-log/handoff degradam sem derrubar. Nenhum achado.
>
> **Deltas vs 2026-06-20:** PERF-001 (proxy cache morto) foi **parcialmente corrigido** — o cache de
> resolução slug/domain no proxy agora funciona (proxy lê `tenant:slug:{slug}`, `resolve-tenant`
> grava via `setTenant`, contrato travado por `src/lib/redis/keys.test.ts`); rebaixado para P2 com
> escopo residual (`getCurrentTenant`). PERF-002..009 permanecem **Abertos** (PERF-006 melhorou para
> `BATCH=4` mas segue all-or-nothing). NOVOS: PERF-010 (webhook LMS faz sync de catálogo completo
> síncrono), PERF-011 (SSE do placar recomputa snapshot não-cacheado por conexão), PERF-012 (exports
> CSV sem teto de linhas).

---

### [PERF-001] `getCurrentTenant` consulta o DB a cada request de vitrine — cache Redis de tenant não cobre o layout
- **Severidade:** P2 _(rebaixado de P1; a parte do proxy foi corrigida)_
- **Status:** Aberto
- **Local:** `src/lib/tenant/current.ts:33-83` (`getCurrentTenant`, `prisma.tenant.findFirst` ~25 colunas) · chamado em `src/app/(main)/layout.tsx`, `src/app/loja/layout.tsx`, `src/app/loja/page.tsx`, `src/app/loja/cursos/page.tsx`, `src/app/loja/curso/[slug]/page.tsx` e +13 (`grep getCurrentTenant src/app` = 18 callers)
- **Evidência:** o proxy/edge já lê o cache `tenant:slug:{slug}` (corrigido) e injeta `x-tenant-id`/`x-tenant-slug`. Mas `getCurrentTenant` (`current.ts:42`) faz `findFirst` no Postgres a cada request — só há dedup intra-request via `cache()` do React. O registro cacheado em Redis (`CachedTenant`: id/slug/status/customDomain) **não** tem os ~25 campos que o layout usa (logoUrl, cores, tagline, whatsapp, tecnica*, eja*, automationEnabled…), então o cache atual não evita a query. Nenhum `unstable_cache`/`"use cache"` envolve `getCurrentTenant`.
- **Impacto:** 1 query Prisma por page-load em TODA vitrine/custom domain (layout + page + subpáginas que repetem o caller). Carga no Postgres proporcional ao tráfego das vitrines; o "cache de 5min" do CLAUDE.md cobre só a resolução de roteamento, não a renderização da marca.
- **Correção:**
  1. Estender `CachedTenant` (`src/lib/redis/tenant-cache.ts:11`) para um payload de branding completo (os campos de `CurrentTenant`), OU criar `getTenantBrandingCached(id)` com chave `tenant:branding:{id}` e TTL 300s.
  2. Em `getCurrentTenant`, antes do `findFirst`: ler do Redis por `x-tenant-id`; em hit, retornar; em miss, consultar o Prisma e popular o cache (best-effort, fail-open — manter o try/catch atual).
  3. Invalidar essa chave em todos os pontos que já chamam `invalidateTenant`/`invalidateTenantCache` (vitrine/banner/dominio/billing/status/eja/tecnica/automacao). Estender `invalidateTenant` para também limpar `tenant:branding:{id}`.
- **Verificação:** 2º request à mesma vitrine não dispara `prisma.tenant.findFirst` (logar `cache.hit`/`cache.miss` em `getCurrentTenant`); teste de unidade com Redis mockado: hit ⇒ zero chamada ao Prisma. Editar a vitrine no painel ⇒ próximo request reflete (invalidação).

---

### [PERF-002] Home pública e vitrine `force-dynamic` sem cache de dados + fan-out SERIAL de queries por seção
- **Severidade:** P1
- **Status:** Aberto
- **Local:** `src/app/(main)/page.tsx:7` (`export const dynamic = "force-dynamic"`) · `src/app/loja/page.tsx:7` · `src/components/main/home/dynamic-home-sections.tsx:50-59` (loop `for (const section of enabled) { await renderSection(...) }` serial) · `src/lib/home/sections.ts:544-603` (`resolveSectionCourses` faz 1-3 queries/seção) · `src/lib/catalog/home.ts:323` (`loadShowcase`)
- **Evidência:** `grep -rl "unstable_cache|revalidateTag|\"use cache\"|cacheTag|next:{revalidate}" src/` retorna **vazio** — zero cache de dados cross-request em todo o `src/` (única exceção é `revalidate=60` em `/api/metrics/public`). Ambas as homes são `force-dynamic`. `DynamicHomeSections` renderiza as N seções habilitadas **em série** (`for...of` com `await`), cada `renderSection` disparando `resolveSectionCourses` (que faz `fetchCoursesByIds` + lookup de categoria) ou `resolveVitrinePackages`/`loadTecnicaSectionContent`/`loadEjaSectionContent` — cada um com 1-3 queries sequenciais. `loadShowcase` + `bannerSlide.findMany` também rodam por request.
- **Impacto:** TTFB/LCP ruins na página de maior tráfego (home PMB + cada vitrine de revenda), pico de carga no DB proporcional a visitantes × seções, zero reuso entre visitantes. Com 6-8 seções a latência soma (serial) em vez de paralelizar.
- **Correção:**
  1. Envolver `loadHomeSections`, `loadShowcase` e `resolveSectionCourses` em `unstable_cache` (ou `"use cache"` + `cacheTag`) com tags por escopo: `home:pmb` e `home:tenant:{tenantId}`; TTL 60-300s.
  2. Chamar `revalidateTag("home:pmb")` / `revalidateTag("home:tenant:{id}")` nos endpoints de edição: `api/admin/home-sections/*`, `api/painel/home-sections/*`, `api/admin/banner/*`, `api/painel/banner/*`, `api/admin/catalogo/*`, sync de catálogo.
  3. Paralelizar o loop de `DynamicHomeSections`: trocar o `for...of await` por `await Promise.all(enabled.map(renderSection))` (preservar a ordem com `nodes` indexado). Atenção: o snapshot de bestsellers via cookie precisa ser resolvido fora do `Promise.all` ou agregado depois (a escrita do cookie só ocorre uma vez).
  4. Remover `force-dynamic` onde o cache cobrir; isolar a leitura do cookie de bestsellers (`cookies()`) em um boundary `<Suspense>` para não forçar dinamismo na árvore inteira.
- **Verificação:** medir TTFB antes/depois em `/` e numa vitrine; contar queries por request via log (`event:"prisma.query"`/contador) — 2º request da mesma home não deve disparar as queries de seção; o loop paralelo reduz wall-time proporcional a N seções.

---

### [PERF-003] Catálogo público sem paginação e com include/select completo — `/cursos` e `/loja/cursos`
- **Severidade:** P1
- **Status:** Aberto
- **Local:** `src/app/(main)/cursos/page.tsx:17,25` (`loadCatalogo({ q, categoriaSlug })` e `loadCatalogo({})` SEM `take`) · `src/lib/catalog/home.ts:242-293` (`loadCatalogo`: `take` é opcional e não é passado pela página) · `src/lib/tenant/courses.ts:239-244` (`listTenantCatalog`: `findMany` SEM `take`/`skip` com `include: { course: true }` = todas as colunas) usado em `src/app/loja/cursos/page.tsx`
- **Evidência:** em `cursos/page.tsx:17`, `loadCatalogo({ q, categoriaSlug })` é chamado sem `take` → `loadCatalogo` (home.ts:280) só aplica `take` quando recebido, logo retorna TODOS os cursos ATIVO com preço>0 (112+ no backfill da matriz). O branch "sem resultados" (`cursos/page.tsx:25`) chama `loadCatalogo({})` → catálogo inteiro de novo. `listTenantCatalog` (courses.ts:240) faz `findMany` sem `take`/`skip` e `include: { course: true }` (puxa todas as colunas de `Course`, não só as do card). Contraste: `listTenantCourses`/`api/loja/courses` paginam; `api/admin/relatorios` capa em 10.000.
- **Impacto:** payload/render crescem linearmente sem teto em duas páginas de alto tráfego SEO (catálogo PMB e catálogo de cada revenda); colunas não exibidas trafegadas; LCP/transfer degradam à medida que o catálogo cresce.
- **Correção:**
  1. `loadCatalogo`: definir `take` padrão (ex.: 24) quando ausente; paginação keyset (por `nome`) ou take/skip + "carregar mais". Passar `take`/cursor de `cursos/page.tsx` lendo `searchParams`.
  2. `listTenantCatalog`: adicionar `take`/`skip` (ou cursor) e trocar `include: { course: true }` por `include: { course: { select: { ...colunas do card } } }`.
  3. No branch "sem resultados", limitar `loadCatalogo({ take: 24 })` em vez de catálogo inteiro.
- **Verificação:** `GET /cursos` e `GET https://{slug}.livrecursos.com.br/cursos` retornam ≤ pageSize itens; payload estável com crescimento do catálogo; medir transfer-size antes/depois.

---

### [PERF-004] Boards de leads carregam TODOS os leads sem `take` (admin e painel)
- **Severidade:** P2
- **Status:** Aberto
- **Local:** `src/app/api/admin/leads/route.ts:51-71` · `src/app/api/painel/leads/route.ts:50-70`
- **Evidência:** ambos `prisma.studentLead.findMany` com `where` por tenant mas **sem `take`** (confirmado: `orderBy` + `select`, nenhum `take:`). O resultado é particionado em colunas de kanban em memória (`for (const lead of serialized) board[lead.stage].push(lead)`). `StudentLead` cresce sem teto.
- **Impacto:** com histórico grande de leads (WON/LOST acumulados), resposta lenta e crescente; serialização de tudo em memória a cada abertura do board.
- **Correção:** limitar por coluna/stage (ex.: `take` por stage via N queries paralelas ou um `take` global + "carregar mais" por coluna); arquivar/colapsar WON/LOST antigos (ex.: só os últimos 30 dias por padrão). Não quebrar o drag-and-drop: o reorder usa `columnOrder`, então paginar por stage preserva a ordenação.
- **Verificação:** endpoint retorna conjunto limitado por stage; tempo de resposta estável injetando milhares de leads sintéticos.

---

### [PERF-005] Crons de varredura sem cap/batch fazem IO externo SEQUENCIAL por item
- **Severidade:** P2
- **Status:** Aberto
- **Local:** `src/app/api/cron/sweep-students-expired/route.ts:65-105` · `src/app/api/cron/sweep-students-overdue/route.ts:40-69` · `src/app/api/cron/reactivate-paid/route.ts:52-100` · `src/app/api/cron/reconcile-tenant-payments/route.ts:22-55`
- **Evidência:** `sweep-students-expired` faz `enrollment.findMany` (sem `take`) e itera `for (const enrollment of expired) { await enrollment.update(); await blockStudentInEA?; await sendEmail() }` — IO externo (plataforma EA/LMS + email) serial por iteração. Idem `sweep-students-overdue` (`findMany` sem `take`, loop serial). `reconcile-tenant-payments` (`route.ts:45`) itera `for (const tenant of tenants)` (sem `take`) e cada `reconcileTenantPayments` faz uma chamada externa Asaas `listPayments` (`src/lib/asaas/reconcile.ts:36`) — N tenants × 1 HTTP serial. Todos com `maxDuration=300`. (Os crons NOVOS já fazem certo: `resync-lms-credentials`, `sync-lms-branding`, `resync-platform-passwords`, `sync-progresso` e `sweep-visitor-events` usam `take`/limit + concorrência limitada via `slice(i, i+CONCURRENCY)`.)
- **Impacto:** com backlog (muitos alunos vencidos ou muitos tenants Asaas), o cron estoura os 300s e falha sem garantia de progresso parcial; reprocessamento total a cada execução.
- **Correção:** padronizar pelo modelo já adotado nos crons LMS/progresso: `take` + cursor (continua na próxima execução, ordenando por `id`/`updatedAt`) e/ou concorrência limitada (`p-limit` ou `slice(i,i+CONCURRENCY)` com `Promise.all`). A idempotência por status já existe (CANCELLED/SUSPENDED não reprocessa). Em `reconcile-tenant-payments`, processar tenants em lotes paralelos limitados. ⚠️MIGRAÇÃO VPS: migrar para worker BullMQ + Redis (job por item, retry nativo).
- **Verificação:** duração com volume sintético (1.000+ enrollments / 200+ tenants) abaixo de 300s; reprocessamento incremental não duplica efeitos (email/bloqueio).

---

### [PERF-006] `regenerate-all` de certificados gera todos os PDFs dentro do request (all-or-nothing, sem resume)
- **Severidade:** P2
- **Status:** Aberto
- **Local:** `src/app/api/admin/certificates/regenerate-all/route.ts:42-72` (`certificate.findMany` SEM `take`; loop `for (i; i<certs.length; i+=BATCH)` com `Promise.allSettled(generateAndUploadPdf)`; `BATCH=4`; `maxDuration=300`)
- **Evidência:** `findMany({ where:{ pdfUrl:{not:null}, revokedAt:null } })` sem `take` → percorre TODOS os certificados de TODOS os tenants. Agora processa em lotes de 4 (melhoria vs 2026-06-20), mas tudo dentro de um único request, resposta agregada all-or-nothing, sem cursor/`?afterId=` para retomar.
- **Impacto:** centenas/milhares de certificados estouram os 300s; sem cursor, uma falha/timeout perde o progresso (ainda que cada PDF seja idempotente por sobrescrita no Storage, não há retomada do ponto).
- **Correção:** paginar por cursor (`?afterId=<certId>` + `take=N`, retornar `nextAfterId`), permitindo o client/ops continuar; OU delegar a background (n8n/cron paginado com flag de pendência). Manter `BATCH`/concorrência. ⚠️MIGRAÇÃO VPS: BullMQ (1 job por certificado, retry + visibilidade).
- **Verificação:** regenerar N>limite-de-tempo conclui em múltiplas chamadas sem timeout; progresso observável (`nextAfterId`/contador); reexecução não duplica (sobrescreve no Storage).

---

### [PERF-007] N+1 no fan-out de notificações por usuário (broadcast ROLE/TENANT)
- **Severidade:** P2
- **Status:** Aberto
- **Local:** `src/lib/notifications.ts:317-323` (branch TENANT) e `:371-377` (branch ROLE) — ambos `Promise.all([...userIds].map(async (userId) => isChannelEnabled(...)))` · `isChannelEnabled` (`:445`) faz `notificationPreference.findFirst` 1×/usuário
- **Evidência:** no fan-out TENANT (`createNotification`), depois de montar `userIds`, roda `Promise.all([...userIds].map(async (userId) => (await isChannelEnabled("in_app", category, { userId })) ? userId : null))` — uma query `findFirst` por usuário. Idem no branch ROLE (`users.map(async (u) => isChannelEnabled(... { userId: u.id }))`). Cada `isChannelEnabled` = `prisma.notificationPreference.findFirst`.
- **Impacto:** broadcast a N usuários dispara N queries de preferência (em paralelo, mas N round-trips ao pool). Piora linearmente com o crescimento da equipe/destinatários; pressão no pool do Supabase em broadcasts grandes.
- **Correção:** substituir o map por uma única query: `prisma.notificationPreference.findMany({ where: { userId: { in: [...userIds] }, category }, select: { userId: true, inApp: true, email: true } })` e resolver as flags em memória (default true quando ausente). Aplicar nos dois branches; reaproveitar o mesmo conjunto para a ponte de email (`dispatchNotificationEmails`) evitando re-consulta.
- **Verificação:** broadcast a N usuários dispara **1** query de preferências (não N); teste de unidade com Prisma mockado contando chamadas.

---

### [PERF-010] Webhook do LMS executa SYNC de catálogo COMPLETO síncrono em `course.published`/`unpublished`
- **Severidade:** P2
- **Status:** Aberto _(NOVO — commit 2f2f708)_
- **Local:** `src/app/api/webhooks/lms/route.ts:101-111` (processa síncrono dentro do request) · `src/lib/webhooks/lms-process.ts:148-152` (case `course.published`/`course.unpublished` → `await syncCatalogFromLMS("cron")`) · `src/lib/catalog/sync-lms.ts:29-100` (`listLmsCourses` + `for (const curso of cursos) { await getLmsCourse(curso.slug); ...upsert; await syncCourseLessons }`)
- **Evidência:** o receiver processa o evento de forma síncrona (comentário no próprio arquivo: "Processa síncrono: 200 = feito, 500 = falha"). Para `course.published`/`course.unpublished`, `processLmsWebhookEvent` chama `syncCatalogFromLMS("cron")`, que **lista todo o catálogo do LMS** e itera `for (const curso of cursos)` fazendo `getLmsCourse(slug)` (HTTP por curso) + upsert + `syncCourseLessons` por curso. Ou seja, publicar UM curso re-sincroniza o catálogo inteiro dentro da entrega do webhook.
- **Impacto:** latência da resposta do webhook proporcional ao tamanho do catálogo LMS (dezenas de HTTP + writes); risco de estourar o timeout do request e o LMS re-tentar, disparando syncs completos repetidos e concorrentes. Acopla a saúde do webhook ao volume do catálogo.
- **Correção:** desacoplar o sync do request do webhook. Opções: (a) marcar uma flag/`SystemSettings.lmsCatalogDirty=true` e responder 200; o cron `sync-cursos-lms` (já existe) consome a flag; ou (b) disparar o sync via `afterResponse(...)` (padrão já usado em `notifications.ts`/emails) para não bloquear a resposta; ou (c) sync incremental de um único curso quando o payload trouxer o `courseId` (em vez de catálogo inteiro). Garantir lock/dedup para não rodar dois syncs completos concorrentes.
- **Verificação:** `POST /api/webhooks/lms` com `course.published` responde rápido (sub-segundo) sem aguardar o sync completo; o catálogo converge em ≤1 ciclo do cron; reentrega do mesmo evento não dispara sync duplicado concorrente.

---

### [PERF-011] SSE do placar recomputa snapshot NÃO-cacheado por conexão a cada 5s
- **Severidade:** P2
- **Status:** Aberto _(NOVO)_
- **Local:** `src/app/api/placar/stream/route.ts:11-13,15-17` (`runtime=nodejs`, `maxDuration=300`, `TICK_MS=5000`, `MAX_TICKS=54`) · `src/lib/placar/snapshot.ts:62-95` (`getActiveTenants` + `getPlacarSnapshot`: `tenant.groupBy` + `tenantPayment.findMany distinct` + `tenant.findMany take:12`)
- **Evidência:** cada conexão EventSource mantém um stream Node por ~270s e, a cada 5s, recomputa `getPlacarSnapshot()` (3 queries agregadas) + compara com `getActiveTenants()` para detectar novas vendas — **sem cache compartilhado**. O snapshot é idêntico para todos os espectadores (dados globais agregados), mas cada conexão consulta o DB independentemente.
- **Impacto:** carga no Postgres = `N_conexões × ~4 queries / 5s`. Numa página pública de "placar de lançamento" (alto interesse/divulgação), dezenas de espectadores simultâneos multiplicam queries agregadas (groupBy varre `Tenant`). Sob Vercel, cada conexão também ocupa uma função de longa duração. ⚠️MIGRAÇÃO VPS: SSE de longa duração precisa de timeout do Traefik configurado e não casa com workers efêmeros.
- **Correção:** computar o snapshot UMA vez por tick globalmente e compartilhar via cache (Redis `placar:snapshot` com TTL 5s, ou um cache em memória do processo com `unstable_cache`/revalidate=5). Cada conexão lê o snapshot cacheado em vez de consultar o DB; a detecção de "venda nova" compara o set ativo cacheado. Assim N conexões custam ~4 queries/5s globais, não por conexão.
- **Verificação:** com K conexões abertas, o número de queries ao DB por 5s permanece ~constante (não escala com K); medir via contador de queries/log.

---

### [PERF-008] `images.unoptimized: true` global desliga otimização de imagem ⚠️MIGRAÇÃO
- **Severidade:** P3
- **Status:** Aberto (verificação manual de infra)
- **Local:** `next.config.ts` (`images.unoptimized: true`, `remotePatterns` para `*.supabase.co`, `playcurso.com`, `s3.bmbr.com.br`)
- **Evidência:** flag ativa por cota Vercel esgotada (402 OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED), documentada no comentário do config. `next/image` serve tamanho cheio. App usa `next/image` corretamente — os 2 `<img>` crus (`mp-checkout-form.tsx:762`, `asaas-checkout-form.tsx:610`) são QR PIX `data:` legítimos. `next/font` em uso (`src/app/layout.tsx`).
- **Impacto:** capas/banners/logos (Supabase + playcurso + s3.bmbr.com.br/LMS) servidos em tamanho cheio → LCP/CLS/transfer piores em todas as vitrines e na home.
- **Correção:** reativar Image Optimization na Vercel (contratar/habilitar) e remover o flag. ⚠️MIGRAÇÃO VPS: definir loader próprio (`sharp` no `output:'standalone'`, imgproxy/thumbor, ou transformação no MinIO) e atualizar `remotePatterns`. Decisão de infra → manual.
- **Verificação:** `/_next/image?url=...&w=...` serve webp redimensionado; medir LCP antes/depois numa vitrine com banner.

---

### [PERF-009] Sem `@next/bundle-analyzer` — sem visibilidade/gate do bundle client
- **Severidade:** P3
- **Status:** Aberto
- **Local:** `package.json` (sem `@next/bundle-analyzer` nem script `analyze`)
- **Evidência:** `grep bundle-analyzer package.json` → vazio. Libs pesadas já isoladas por `await import(...)` dinâmico: `jspdf`/`jspdf-autotable` (`report-viewer.tsx:128`), `gsap`/`ScrollTrigger` (`landing-animations.tsx:29`), `driver.js` (`onboarding-tour.tsx:275`); `@react-pdf/renderer`+`qrcode` em `serverExternalPackages`. Mas não há gate de regressão de bundle.
- **Correção:** adicionar `@next/bundle-analyzer` (devDependency) com wrapper `withBundleAnalyzer` ativado por `ANALYZE=1` no `next.config.ts`; opcionalmente um step no CI. Charts (`finance-bar-chart`, `revenue-chart`) são importados estáticos — confirmar no treemap se vale `dynamic`.
- **Verificação:** `ANALYZE=1 next build` gera o treemap; revisar os maiores chunks client.

---

### [PERF-012] Exports CSV sem teto de linhas (MAX_ROWS) — comissões, payouts, financeiro
- **Severidade:** P3
- **Status:** Aberto _(NOVO)_
- **Local:** `src/app/api/admin/referrals/commissions/export/route.ts:117` · `src/app/api/admin/referrals/payouts/export/route.ts:119` · `src/app/api/painel/financeiro/export-csv/route.ts:36`
- **Evidência:** os três `findMany` montam o CSV sem `take`/cap. `commissions/export` e `payouts/export` percorrem os ledgers de referral globais (crescem indefinidamente). `financeiro/export-csv` é escopado por `tenantId` + range de data opcional, com `include` aninhado (student/course) — sem teto. Contraste: o módulo de relatórios (`src/lib/reports/definitions.ts:42`) impõe `MAX_REPORT_ROWS = 10_000` em todos os `take`.
- **Impacto:** export de período longo/ledger grande carrega tudo em memória e serializa um CSV ilimitado, podendo estourar memória/timeout do request. Menor frequência (download admin/owner) que páginas, daí P3.
- **Correção:** aplicar o mesmo `MAX_REPORT_ROWS` (10.000) com `take` nos três `findMany`; quando atingir o teto, sinalizar truncamento (header/linha final) e sugerir filtrar por período. Para `financeiro/export-csv`, exigir/assumir range de data padrão (ex.: 12 meses) quando ausente.
- **Verificação:** export com >10.000 linhas retorna ≤ cap e sinaliza truncamento; tempo/memória estáveis.

---

## Cobertura

### Cache (Redis/Upstash) — Seção 1 da referência
- **Resiliência a outage:** OK (fix `dcd03fd` mantido — todo `redis.*()` em try/catch; `rateLimit` failOpen; proxy fail-open).
- **Cache de tenant (TTL/invalidação):** proxy slug/domain → **Corrigido** (PERF-001 antigo resolvido: lê `tenant:slug:{slug}`, grava via `setTenant` no `resolve-tenant`, TTL 60s, invalidação em ~20 callers de `invalidateTenant`/`invalidateTenantCache`); branding do layout → **PERF-001** (residual).
- **Stampede/SWR:** sem lock em chaves quentes (home/branding) → coberto por PERF-002/PERF-001 (cache + SWR recomendados). 
- **Namespacing por tenant:** OK — chaves `tenant:slug:`/`tenant:domain:`/`tenant:id:`/`tenant:branding:` namespaceadas; `keys.test.ts` trava o contrato; sem colisão.
- **⚠️MIGRAÇÃO @upstash REST:** `src/lib/redis.ts`, `src/lib/ratelimit.ts` (imports `@upstash/redis`) + `src/proxy.ts:153,175` (fetch REST direto `…/get/…`) + CSP `connect-src https://*.upstash.io` → **não falam Redis TCP**. P1 para a migração (trocar por `ioredis`/`redis` ou SRH).

### Cache do Next (App Router) — Seção 2
- `unstable_cache`/`revalidateTag`/`"use cache"`/tags: **ausentes em todo `src/`** → PERF-002. Único route-level cache: `revalidate=60` em `/api/metrics/public` (OK). `sitemap`/`llms.txt` revalidate OK.
- `force-dynamic`: 99 ocorrências; home/loja injustificadas → PERF-002; demais (rotas autenticadas/cookies/checkout) justificadas (N/A).

### Frontend — CWV/bundle — Seção 3
- `next/image`: OK (2 `<img>` são QR `data:` legítimos). Otimização global desligada → PERF-008. `next/font`: OK (`layout.tsx`). Dynamic import de libs pesadas (jspdf/gsap/driver.js): OK. Bundle-analyzer: PERF-009. Charts estáticos: nota em PERF-009.

### Paginação e volume — Seção 4
- `/cursos` + `/loja/cursos` sem paginação → PERF-003. Leads (admin+painel) sem `take` → PERF-004. Exports CSV sem cap → PERF-012.
- Bounded/OK (N/A): `api/loja/courses` (pagina), `api/loja/cursos/[slug]`, `painel/alunos`/`admin/alunos` (paginam), relatórios (cap 10.000), `metrics/public` (count + revalidate), `home/showcase` (`destaqueHome` curado), `loadShowcase` (`take:6/3`). Catálogos de gestão `admin/catalogo`/`painel/cursos`/`aluno/catalogo` sem `take` mas dataset ~112 cursos, com `select` — risco baixo (N/A, monitorar). Cupons/notes/templates/categorias/push-devices: escopo por entidade, volume baixo (N/A).
- `select('*')`/include gordo: `listTenantCatalog` `include:{course:true}` → PERF-003; demais grids usam `select`/`include` enxuto (OK).
- Agregações no banco: OK (`groupBy`/`count`/`_count` em placar, metrics, relatórios, dashboards).

### Jobs longos / background — Seção 5
- Crons: sweep-expired/overdue, reactivate-paid, reconcile-tenant-payments → PERF-005 (serial/sem cap). `regenerate-all` → PERF-006. Webhook LMS `course.published` → PERF-010 (sync completo no request).
- **OK (batch/bounded):** `resync-lms-credentials`, `sync-lms-branding`, `resync-platform-passwords` (take+CONCURRENCY), `sync-progresso` (take+cursor por staleness), `sweep-visitor-events` (BATCH_SIZE), `cleanup-webhook-logs` (maxDuration 60), `referral-monthly-payout`, `sweep-abandoned-leads` (N tenants mas trabalho leve por tenant — monitorar), `sync-cursos`/`sync-cursos-lms`/`sync-day-update-lms` (sync agendado, bounded pelo catálogo).
- Webhooks: `asaas`/`mercadopago` idempotentes e enxutos (OK do ponto de vista perf); `lms` → PERF-010.
- SSE: `placar/stream` recomputa sem cache → PERF-011. `placar/stream` ⚠️MIGRAÇÃO (timeout Traefik). 
- ⚠️MIGRAÇÃO VPS filas: crons longos (PERF-005/006) → BullMQ + worker no Swarm.

### ⚠️MIGRAÇÃO Vercel→VPS (resumo)
- `@upstash/redis` REST (redis.ts, ratelimit.ts, proxy.ts:153/175) + CSP `*.upstash.io` → trocar por TCP (`ioredis`/`redis`) ou SRH. **P1 migração.**
- `output:'standalone'` **ausente** em `next.config.ts` — necessário p/ Docker. 
- Proxy roda no Edge (usa `fetch` REST ao Upstash, sem Prisma) — compatível com Node, mas o runtime Edge da Vercel some.
- Otimizador de imagem (PERF-008): loader próprio (sharp/imgproxy/MinIO).
- Crons via Vercel/pg_cron → scheduler no Swarm (cron container ou BullMQ repeatable jobs).
- SSE `placar/stream` (maxDuration 300): exige timeout de proxy no Traefik.
