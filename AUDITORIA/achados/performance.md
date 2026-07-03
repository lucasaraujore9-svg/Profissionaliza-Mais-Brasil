# Auditoria — Performance
_Data: 2026-07-03 · Referência: `.claude/skills/auditoria-saas/references/04-performance.md` · Itens do inventário cobertos: relevantes ao domínio (137 telas · 309 handlers · 342 componentes · 17 crons · 3 webhooks) — veja seção Cobertura_

> Re-verificação do relatório de 2026-06-24 (que já re-verificava 2026-06-20). Auditor read-only.
> Delta de ~43 commits desde 2026-06-24 (BI hub admin+painel, placar com som + SSE de indicações,
> tours guiados, parcelamento consultando MP no servidor, sync LMS `course.updated`, edição em massa
> sequencial). Cada achado antigo teve o Status re-verificado no código atual; achados novos entram
> com IDs contínuos.

## Resumo
- Itens verificados: 13 achados · Achados: **P0=0 · P1=3 · P2=6 · P3=4** · Nota do domínio: **6/10**
- **Corrigido no delta:** o fan-out SERIAL das seções da home (PERF-002.3) virou `Promise.all` — a
  latência das N seções agora paraleliza. Os charts do BI hub são `dynamic(ssr:false)` via barrel
  (`components/reports/charts/index.tsx`) e as agregações de BI são feitas no banco (`date_trunc`
  + `GROUP BY`, tabelas capadas em `take`), sem N+1 — bom design, sem achado novo aí.
- **Piorou no delta:** PERF-010 escalado para **P1** — além de `course.published/unpublished`, o
  webhook LMS agora dispara sync de catálogo COMPLETO síncrono também em `course.updated` (evento
  por-edição, frequente).
- **Resiliência a outage do Redis (fix `dcd03fd`): mantém-se OK** — todo `redis.*()` em try/catch;
  `rateLimit`/`runLimit` failOpen; proxy fail-open; `resolve-tenant` `failOpen:true`. Sem achado.
- **Estado do cache Next:** `grep -rn "unstable_cache|revalidateTag|\"use cache\"|cacheTag" src/` →
  **vazio**. Zero cache de dados cross-request em `src/` (única exceção: `revalidate=60` em
  `/api/metrics/public`). `force-dynamic`: 112 ocorrências (era 99).

---

## Achados

### [PERF-002] Home pública e vitrine `force-dynamic` sem cache de dados cross-request
- **Severidade:** P1
- **Status:** Aberto _(o item de paralelização foi corrigido; o de cache permanece)_
- **Local:** `src/app/(main)/page.tsx:7` (`export const dynamic = "force-dynamic"`) · `src/app/loja/page.tsx:7` · `src/components/main/home/dynamic-home-sections.tsx:37-75` · `src/lib/home/sections.ts` (`loadHomeSections`/`resolveSectionCourses`) · `src/lib/catalog/home.ts` (`loadShowcase`)
- **Evidência:** ambas as homes são `force-dynamic` e não há **nenhum** `unstable_cache`/`revalidateTag`/`"use cache"` em `src/` (grep vazio). Cada visita re-executa `loadShowcase()` + `bannerSlide.findMany` (`page.tsx:10-22`) e, dentro de `DynamicHomeSections`, `loadHomeSections` + `resolveInterestFree` + `resolveSupportHours` (`dynamic-home-sections.tsx:37-41`) e uma `renderSection` por seção — cada uma disparando 1-3 queries (`resolveSectionCourses`/`resolveVitrinePackages`/`loadTecnicaSectionContent`/`loadEjaSectionContent`). **Correção parcial confirmada:** o fan-out serial antigo (`for...of await`) virou `await Promise.all(enabled.map(renderSection))` (`dynamic-home-sections.tsx:63-75`) — a latência das seções agora paraleliza. O que resta: zero reuso entre visitantes (nenhum cache), 1 DB fan-out por page-load na página de MAIOR tráfego (home PMB + cada vitrine de revenda).
- **Impacto:** TTFB/LCP dependem do DB a cada visita; pico de carga no Postgres proporcional a visitantes × seções; sem proteção contra stampede em chave quente. O "cache de 5min" do CLAUDE.md cobre só a resolução de roteamento (slug→tenant), não a renderização da home.
- **Correção:**
  1. Envolver `loadHomeSections`, `loadShowcase` e `resolveSectionCourses` em `unstable_cache` (ou `"use cache"` + `cacheTag`) com tags `home:pmb` e `home:tenant:{tenantId}`; TTL 60-300s.
  2. `revalidateTag("home:pmb")` / `revalidateTag("home:tenant:{id}")` nos endpoints de edição: `api/admin/home-sections/*`, `api/painel/home-sections/*`, `api/admin/banner/*`, `api/painel/banner/*`, `api/admin/catalogo/*`, sync de catálogo.
  3. Remover `force-dynamic` onde o cache cobrir; isolar a leitura do cookie de bestsellers (`cookies()` em `dynamic-home-sections.tsx:48`) num boundary `<Suspense>` para não forçar dinamismo na árvore inteira.
- **Verificação:** medir TTFB antes/depois em `/` e numa vitrine; contar queries por request via log — 2º request da mesma home não deve disparar as queries de seção.

---

### [PERF-003] Catálogo público sem paginação e com `include: { course: true }` — `/cursos` e `/loja/cursos`
- **Severidade:** P1
- **Status:** Aberto
- **Local:** `src/app/(main)/cursos/page.tsx:17` (`loadCatalogo({ q, categoriaSlug })` SEM `take`) e `:25` (`loadCatalogo({})` no branch "sem resultados") · `src/lib/catalog/home.ts:263-298` (`loadCatalogo`: `take` opcional, aplicado só quando recebido via `...(take ? { take } : {})`) · `src/lib/tenant/courses.ts:226,260-263` (`listTenantCatalog`: `tenantCourse.findMany` SEM `take`/`skip`, `include: { course: true }` = todas as colunas de `Course`)
- **Evidência:** `cursos/page.tsx:17` chama `loadCatalogo({ q, categoriaSlug })` sem `take` → retorna TODOS os cursos ATIVO com preço>0 (112+ após o backfill de matriz); o branch vazio (`:25`) chama `loadCatalogo({})` = catálogo inteiro de novo. `listTenantCatalog` (`courses.ts:260`) faz `findMany` sem `take`/`skip` e `include: { course: true }` (puxa toda a `Course`, não só os campos do card). Contraste: `api/loja/courses` e `admin/alunos`/`painel/alunos` paginam; os relatórios capam em 10.000.
- **Impacto:** payload/render crescem linearmente sem teto em duas páginas de alto tráfego SEO (catálogo PMB + catálogo de cada revenda); colunas não exibidas trafegadas; LCP/transfer degradam à medida que o catálogo cresce (LMS adiciona cursos continuamente).
- **Correção:**
  1. `loadCatalogo`: `take` padrão (ex.: 24) quando ausente; paginação keyset por `nome` ou take/skip + "carregar mais"; passar `take`/cursor de `cursos/page.tsx` lendo `searchParams`.
  2. `listTenantCatalog`: adicionar `take`/`skip` (ou cursor) e trocar `include: { course: true }` por `include: { course: { select: { ...só as colunas do card } } }`.
  3. Branch "sem resultados": `loadCatalogo({ take: 24 })` em vez de catálogo inteiro.
- **Verificação:** `GET /cursos` e `GET https://{slug}.livrecursos.com.br/cursos` retornam ≤ pageSize; medir transfer-size antes/depois.

---

### [PERF-010] Webhook do LMS executa SYNC de catálogo COMPLETO síncrono em `course.updated`/`published`/`unpublished`
- **Severidade:** P1 _(escalado de P2 — `course.updated` foi adicionado no delta, commit d2d3343)_
- **Status:** Aberto
- **Local:** `src/app/api/webhooks/lms/route.ts:105-118` (processa síncrono dentro do request: "Processa síncrono. ok → 200 … exceção transitória → 500") · `src/lib/webhooks/lms-process.ts:152-158` (case `course.published`/`course.unpublished`/`course.updated` → `await syncCatalogFromLMS("cron")`) · `src/lib/catalog/sync-lms.ts:93-104+` (`listLmsCourses()` + `for (const curso of cursos)` com `getLmsCourse(slug)` HTTP por curso + upsert + `syncCourseLessons`)
- **Evidência:** o receiver processa o evento de forma síncrona e responde 200/500 conforme o resultado. Para os três eventos de catálogo (`lms-process.ts:152-158`), `processLmsWebhookEvent` chama `syncCatalogFromLMS("cron")`, que **lista todo o catálogo LMS** e itera curso a curso fazendo `getLmsCourse(slug)` (1 HTTP extra de detalhe por curso, para capa+aulas — comentado em `sync-lms.ts:87-92`) + upsert + `syncCourseLessons`. Ou seja: editar UM curso no LMS re-sincroniza o catálogo inteiro dentro da entrega do webhook. O agravante do delta: `course.updated` é um evento por-edição (muito mais frequente que publicar/despublicar).
- **Impacto:** latência da resposta do webhook proporcional ao tamanho do catálogo LMS (dezenas de HTTP + writes por evento); risco de estourar o timeout do request → o LMS re-tenta → syncs completos repetidos e concorrentes. Uma rajada de edições no LMS pode disparar múltiplos syncs full concorrentes sobre o Postgres e a API LMS. Acopla a saúde do webhook ao volume do catálogo.
- **Correção:** desacoplar o sync do request. Opções: (a) marcar `SystemSettings.lmsCatalogDirty=true`, responder 200, e o cron `sync-cursos-lms` (já existe) consome a flag; ou (b) disparar via `afterResponse(...)` (padrão já usado em `notifications.ts`/emails) para não bloquear a resposta; ou (c) sync incremental de UM curso quando o payload trouxer o id/slug do curso (em vez de catálogo inteiro). Em qualquer caso, lock/dedup para não rodar dois syncs full concorrentes.
- **Verificação:** `POST /api/webhooks/lms` com `course.updated` responde sub-segundo sem aguardar o sync; catálogo converge em ≤1 ciclo de cron; reentrega do mesmo evento não dispara sync duplicado concorrente.

---

### [PERF-001] `getCurrentTenant` consulta o DB a cada request de vitrine — cache de tenant não cobre o branding do layout
- **Severidade:** P2
- **Status:** Aberto
- **Local:** `src/lib/tenant/current.ts:35-87` (`getCurrentTenant`, `prisma.tenant.findFirst` com ~25 colunas) — 18 callers em `src/app` (`(main)/layout.tsx`, `loja/layout.tsx`, `loja/page.tsx`, `loja/cursos/page.tsx`, `loja/curso/[slug]/page.tsx` etc.)
- **Evidência:** o proxy/edge já lê o cache `tenant:slug:{slug}` (corrigido em auditoria anterior) e injeta `x-tenant-id`/`x-tenant-slug`. Mas `getCurrentTenant` (`current.ts:44`) faz `findFirst` no Postgres a cada request — só há dedup intra-request via `cache()` do React (`current.ts:35`). O registro cacheado em Redis (`CachedTenant`) não carrega os ~25 campos de branding que o layout usa (logoUrl, cores, tagline, whatsapp/instagram/facebook/youtube/tiktok, supportHours, tecnica*, eja*, automationEnabled). Nenhum `unstable_cache` envolve `getCurrentTenant`.
- **Impacto:** 1 query Prisma por page-load em TODA vitrine/custom domain (layout + page + subpáginas repetem o caller, deduplicadas por request). Carga no Postgres proporcional ao tráfego das vitrines.
- **Correção:**
  1. Estender o cache de tenant (ou criar `getTenantBrandingCached(id)` com chave `tenant:branding:{id}`, TTL 300s) para o payload completo de `CurrentTenant`.
  2. Em `getCurrentTenant`, antes do `findFirst`: ler do Redis por `x-tenant-id`; hit → retorna; miss → Prisma + popula cache (best-effort, mantendo o try/catch atual).
  3. Estender `invalidateTenant`/`invalidateTenantCache` para limpar também `tenant:branding:{id}` (vitrine/banner/domínio/billing/status/eja/tecnica/automação).
- **Verificação:** 2º request à mesma vitrine não dispara `prisma.tenant.findFirst`; teste com Redis mockado (hit ⇒ zero chamada ao Prisma); editar a vitrine no painel ⇒ próximo request reflete.

---

### [PERF-004] Boards de leads carregam TODOS os leads sem `take` (admin e painel)
- **Severidade:** P2
- **Status:** Aberto
- **Local:** `src/app/api/admin/leads/route.ts:51-71` · `src/app/api/painel/leads/route.ts:50-70`
- **Evidência:** ambos `prisma.studentLead.findMany` com `where` por tenant, `orderBy` + `select`, mas **sem `take`** (confirmado no bloco `admin/leads/route.ts:51-71`). O resultado é particionado em colunas de kanban em memória (`for (const lead of serialized) board[lead.stage].push(lead)`). `StudentLead` cresce sem teto (WON/LOST acumulados).
- **Impacto:** com histórico grande, resposta lenta e crescente; serialização de tudo em memória a cada abertura do board.
- **Correção:** limitar por stage (N queries paralelas com `take` por coluna, ou `take` global + "carregar mais"); colapsar WON/LOST antigos (ex.: últimos 30 dias por padrão). Preservar o drag-and-drop (reorder usa `columnOrder`).
- **Verificação:** endpoint retorna conjunto limitado por stage; tempo estável injetando milhares de leads sintéticos.

---

### [PERF-005] Crons de varredura sem cap/batch fazem IO externo SEQUENCIAL por item
- **Severidade:** P2
- **Status:** Aberto
- **Local:** `src/app/api/cron/sweep-students-expired/route.ts:66` (`enrollment.findMany` SEM `take` + loop serial de update/bloqueio/email) · `src/app/api/cron/sweep-students-overdue/route.ts` · `src/app/api/cron/reactivate-paid/route.ts` · `src/app/api/cron/reconcile-tenant-payments/route.ts:22` (`tenant.findMany` SEM `take`, `for (const tenant)` com `reconcileTenantPayments` → 1 HTTP Asaas por tenant) — todos `maxDuration=300`
- **Evidência:** `sweep-students-expired` (`route.ts:66`) faz `enrollment.findMany` sem `take` e itera fazendo IO externo (EA/LMS + email) serial por iteração. `reconcile-tenant-payments` (`route.ts:22`) itera N tenants × 1 chamada Asaas `listPayments` serial. (Os crons NOVOS já fazem certo: `resync-lms-credentials`, `sync-lms-branding`, `resync-platform-passwords`, `sync-progresso`, `sweep-visitor-events` usam `take`/limit + concorrência limitada.)
- **Impacto:** com backlog (muitos alunos vencidos / muitos tenants Asaas), o cron estoura 300s e falha sem garantia de progresso parcial; reprocessamento total a cada execução.
- **Correção:** padronizar pelo modelo dos crons LMS/progresso: `take` + cursor (retoma na próxima execução) e/ou concorrência limitada (`p-limit`/`slice(i,i+CONCURRENCY)` com `Promise.all`). Idempotência por status já existe. ⚠️MIGRAÇÃO VPS: migrar para worker **BullMQ + Redis** (job por item, retry nativo).
- **Verificação:** duração com volume sintético (1.000+ enrollments / 200+ tenants) abaixo de 300s; reprocessamento incremental não duplica email/bloqueio.

---

### [PERF-006] `regenerate-all` de certificados gera todos os PDFs dentro do request (all-or-nothing, sem resume)
- **Severidade:** P2
- **Status:** Aberto
- **Local:** `src/app/api/admin/certificates/regenerate-all/route.ts:41` (`certificate.findMany` SEM `take`), `:50-52` (loop `for (i; i<certs.length; i+=BATCH)` com `Promise.allSettled`; `BATCH=4`; `maxDuration=300`)
- **Evidência:** `findMany({ where:{ pdfUrl:{not:null}, revokedAt:null } })` sem `take` → percorre TODOS os certificados de TODOS os tenants. Processa em lotes de 4 (`BATCH=4`) dentro de um único request, resposta agregada all-or-nothing, sem cursor/`?afterId=` para retomar.
- **Impacto:** centenas/milhares de certificados estouram os 300s; sem cursor, uma falha/timeout perde o progresso (cada PDF é idempotente por sobrescrita no Storage, mas não há retomada do ponto).
- **Correção:** paginar por cursor (`?afterId=<certId>` + `take=N`, retornar `nextAfterId`) para o client/ops continuar; OU delegar a background (n8n/cron paginado). Manter `BATCH`. ⚠️MIGRAÇÃO VPS: BullMQ (1 job por certificado).
- **Verificação:** regenerar N>limite-de-tempo conclui em múltiplas chamadas sem timeout; progresso observável; reexecução não duplica.

---

### [PERF-007] N+1 no fan-out de notificações por usuário (broadcast ROLE/TENANT)
- **Severidade:** P2
- **Status:** Aberto
- **Local:** `src/lib/notifications.ts:318-319` (branch TENANT) e `:372-373` (branch ROLE) — ambos `Promise.all([...].map(async (userId) => isChannelEnabled(...)))` · `isChannelEnabled` (`:238`) faz `notificationPreference.findFirst` 1×/usuário
- **Evidência:** no fan-out TENANT (`notifications.ts:318`) e ROLE (`:372`), após montar `userIds`, roda `Promise.all([...userIds].map(async (userId) => (await isChannelEnabled("in_app", category, { userId })) ? userId : null))` — uma query `findFirst` por usuário (em paralelo, mas N round-trips ao pool).
- **Impacto:** broadcast a N usuários dispara N queries de preferência; pressão no pool do Supabase em broadcasts grandes; piora linear com o crescimento da equipe/destinatários.
- **Correção:** substituir o map por uma única query `prisma.notificationPreference.findMany({ where: { userId: { in: [...userIds] }, category }, select: { userId, inApp, email } })` e resolver as flags em memória (default true quando ausente). Aplicar nos dois branches; reusar o conjunto na ponte de email (`dispatchNotificationEmails`).
- **Verificação:** broadcast a N usuários dispara **1** query de preferências; teste com Prisma mockado contando chamadas.

---

### [PERF-011] SSE do placar recomputa snapshot NÃO-cacheado por conexão a cada 5s (lançamento + indicações)
- **Severidade:** P2
- **Status:** Aberto _(escopo ampliado: agora há DOIS streams SSE)_
- **Local:** `src/app/api/placar/stream/route.ts:15-18,66-87` (`runtime=nodejs`, `maxDuration=300`, `TICK_MS=5000`, `MAX_TICKS=54`; a cada tick `getPlacarSnapshot()` + `getActiveTenants()`) · `src/app/api/painel/placar/stream/route.ts:16,80-101` (mesmo padrão, `getReferralPlacarSnapshot(tenantId)` — NOVO no delta) · `src/lib/placar/snapshot.ts:71-95` (`tenant.groupBy` + `tenantPayment.findMany distinct` + `tenant.findMany take:12`) e `:141-169` (variante por `referrerTenantId`)
- **Evidência:** cada conexão EventSource mantém um stream Node por ~270s e a cada 5s recomputa o snapshot (3 queries agregadas) + compara com o set ativo para detectar novas vendas — **sem cache compartilhado**. O snapshot de lançamento é idêntico para todos os espectadores (dados globais agregados), mas cada conexão consulta o DB independentemente. O stream do painel (`getReferralPlacarSnapshot`) é escopado por `referrerTenantId` mas repete o padrão por conexão.
- **Impacto:** carga no Postgres = `N_conexões × ~4 queries / 5s`. Numa página pública de "placar de lançamento" divulgada, dezenas de espectadores simultâneos multiplicam queries agregadas (o `groupBy` varre `Tenant`). Sob Vercel, cada conexão ocupa uma função de longa duração. ⚠️MIGRAÇÃO VPS: SSE de longa duração exige timeout do Traefik configurado e não casa com workers efêmeros.
- **Correção:** computar o snapshot UMA vez por tick globalmente e compartilhar via cache (Redis `placar:snapshot` TTL 5s para o global; `placar:ref:{referrerTenantId}` para o do painel). Cada conexão lê o snapshot cacheado; a detecção de "venda nova" compara o set cacheado. Assim N conexões custam ~4 queries/5s (por chave), não por conexão.
- **Verificação:** com K conexões abertas, as queries ao DB por 5s permanecem ~constantes (não escalam com K); medir via contador/log.

---

### [PERF-008] `images.unoptimized: true` global desliga otimização de imagem ⚠️MIGRAÇÃO
- **Severidade:** P3
- **Status:** Aberto (verificação manual de infra)
- **Local:** `next.config.ts:64` (`unoptimized: true`), `:65` (`remotePatterns` para `*.supabase.co`, `playcurso.com`, `s3.bmbr.com.br`)
- **Evidência:** flag ativa por cota Vercel esgotada (402 OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED, documentada em `next.config.ts:59`). `next/image` serve tamanho cheio. App usa `next/image` corretamente — `grep "<img "` (fora de `data:`/QR) retornou **vazio**. `next/font` em uso (`src/app/layout.tsx`).
- **Impacto:** capas/banners/logos (Supabase + playcurso + s3.bmbr.com.br/LMS) servidos em tamanho cheio → LCP/CLS/transfer piores em todas as vitrines e na home.
- **Correção:** reativar Image Optimization na Vercel e remover o flag. ⚠️MIGRAÇÃO VPS: loader próprio (`sharp` com `output:'standalone'`, imgproxy/thumbor, ou transformação no MinIO) + atualizar `remotePatterns`. Decisão de infra → manual.
- **Verificação:** `/_next/image?url=...&w=...` serve webp redimensionado; medir LCP antes/depois numa vitrine com banner.

---

### [PERF-009] Sem `@next/bundle-analyzer` (sem gate de bundle) e sem `output: 'standalone'` ⚠️MIGRAÇÃO
- **Severidade:** P3
- **Status:** Aberto
- **Local:** `package.json` (sem `@next/bundle-analyzer` nem script `analyze`) · `next.config.ts` (sem `output: 'standalone'` — grep "output" vazio)
- **Evidência:** `grep bundle-analyzer|analyze|standalone package.json next.config.ts` → vazio. Libs pesadas já isoladas por dynamic import: `driver.js` (`src/components/shared/tour/tour-runner.tsx:96` `await import("driver.js")`), charts do BI (`src/components/reports/charts/index.tsx` — `dynamic(ssr:false)` por card, recharts fora do bundle inicial), `jspdf`/`gsap` (auditorias anteriores). Mas não há gate de regressão de bundle, e a ausência de `output:'standalone'` bloqueia o build Docker na migração.
- **Correção:** adicionar `@next/bundle-analyzer` (devDep) com `withBundleAnalyzer` ativado por `ANALYZE=1`. ⚠️MIGRAÇÃO VPS: setar `output: 'standalone'` no `next.config.ts` (necessário para a imagem Docker/Swarm) + healthcheck.
- **Verificação:** `ANALYZE=1 next build` gera o treemap; `output:'standalone'` produz `.next/standalone`.

---

### [PERF-012] Exports CSV sem teto de linhas (MAX_ROWS) — comissões, payouts, financeiro da revenda
- **Severidade:** P3
- **Status:** Aberto
- **Local:** `src/app/api/admin/referrals/commissions/export/route.ts:117` · `src/app/api/admin/referrals/payouts/export/route.ts:119` · `src/app/api/painel/financeiro/export-csv/route.ts:36`
- **Evidência:** os três `findMany` montam o CSV sem `take`/cap (grep confirmou `findMany` sem `take`/`MAX`). `commissions/export` e `payouts/export` percorrem ledgers de referral globais (crescem indefinidamente). `financeiro/export-csv` é escopado por `tenantId` + range opcional, com `include` aninhado, sem teto. Contraste: `src/lib/reports/definitions.ts:42` impõe `MAX_REPORT_ROWS = 10_000` em todos os `take`.
- **Impacto:** export de período longo/ledger grande carrega tudo em memória e serializa CSV ilimitado, podendo estourar memória/timeout. Menor frequência (download admin/owner) → P3.
- **Correção:** aplicar `take: MAX_REPORT_ROWS` (10.000) nos três `findMany`; ao atingir o teto, sinalizar truncamento (linha final) e sugerir filtrar por período. Para `financeiro/export-csv`, assumir range padrão (ex.: 12 meses) quando ausente.
- **Verificação:** export com >10.000 linhas retorna ≤ cap e sinaliza truncamento; tempo/memória estáveis.

---

### [PERF-013] Edição em massa de cursos grava por UPDATEs SEQUENCIAIS (até 500 round-trips no request)
- **Severidade:** P3
- **Status:** Aberto _(NOVO — commit 019a253)_
- **Local:** `src/app/api/admin/catalogo/bulk/route.ts:69` (`items` cap **500**), `:116-135` (`for (const it of parsed.data.items) { await prisma.course.update(...) }`) · `src/app/api/painel/cursos/bulk/route.ts:76` (cap **200**), `:121-144` (loop sequencial `await tenantCourse.update`)
- **Evidência:** ambos os endpoints trocaram `$transaction([...])` (que derrubava o lote sobre `@prisma/adapter-pg` + pooler Supabase, ver commit) por updates sequenciais em `for...of await` — um round-trip ao pooler por item. Admin permite até 500 itens (`bulkSchema … max(500)`), painel até 200. A 15-30ms/update sob pooler, 500 itens ≈ 7-15s dentro de um request (sem `maxDuration` explícito nesses handlers → limite padrão da plataforma).
- **Impacto:** lote grande (500 cursos no admin) pode se aproximar/estourar o timeout do request; nenhuma retomada parcial se o request cair (embora `failed[]` reporte por linha). Hoje o catálogo é ~112 cursos, então o risco real é moderado → P3.
- **Correção:** substituir o loop sequencial por concorrência limitada — os updates INDIVIDUAIS concorrentes (`Promise.all` em chunks de, ex., 10 via `p-limit`/`slice`) funcionam sobre o pooler (o problema era `$transaction([...])` em lote, não updates concorrentes). Mantém o relatório `failed[]` por linha e corta o wall-time. Alternativa: reduzir o cap admin de 500 para algo compatível com o timeout.
- **Verificação:** editar 500 itens conclui bem abaixo do timeout; `failed[]` continua reportando linhas com erro sem abortar as demais.

---

## Cobertura

### Cache (Redis/Upstash) — Seção 1 da referência
- **Resiliência a outage:** OK (fix `dcd03fd` mantido — todo `redis.*()` em try/catch; `rateLimit` failOpen; proxy fail-open).
- **Cache de tenant (TTL/invalidação):** proxy slug/domain → **OK/Corrigido** (lê `tenant:slug:{slug}`, grava via `setTenant`, invalidação em ~20 callers de `invalidateTenant`); branding do layout → **PERF-001** (residual).
- **Stampede/SWR:** sem lock em chaves quentes (home/branding/placar) → coberto por PERF-002/PERF-001/PERF-011.
- **Namespacing por tenant:** OK — chaves `tenant:slug:`/`tenant:domain:`/`tenant:id:` namespaceadas (`keys.test.ts`); sem colisão.
- **⚠️MIGRAÇÃO @upstash REST:** `src/lib/redis.ts`, `src/lib/ratelimit.ts` (imports `@upstash/redis`) + `src/proxy.ts` (fetch REST direto ao Upstash) + CSP `connect-src https://*.upstash.io` → **não falam Redis TCP self-hosted**. Trocar por `ioredis`/`redis` ou rodar SRH. **P1 para a migração** (rastreado aqui, não é achado de produção).

### Cache do Next (App Router) — Seção 2
- `unstable_cache`/`revalidateTag`/`"use cache"`/tags: **ausentes em todo `src/`** → PERF-002. Único route-level cache: `revalidate=60` em `/api/metrics/public` (OK). `sitemap`/`llms.txt` revalidate OK.
- `force-dynamic`: 112 ocorrências; home/loja injustificadas → PERF-002; BI/relatórios, checkout, rotas autenticadas com cookies/headers → justificadas (N/A).

### Frontend — CWV/bundle — Seção 3
- `next/image`: OK (`grep "<img "` sem hits fora de `data:`/QR). Otimização global desligada → PERF-008. `next/font`: OK. Dynamic import de libs pesadas: OK (`driver.js` em `tour-runner.tsx:96`; charts recharts via barrel `components/reports/charts/index.tsx` `dynamic(ssr:false)`; jspdf/gsap em auditorias anteriores). `driver.js/dist/driver.css` importado estático em `tour-runner.tsx:5` — CSS pequeno, aceitável (N/A). Bundle-analyzer ausente → PERF-009.
- Over-clientização: `report-tab-view.tsx` `"use client"` necessário (Recharts). BI hub monta o payload no server (route handler), client só renderiza — OK.

### Paginação e volume — Seção 4
- `/cursos` + `/loja/cursos` (`listTenantCatalog`) sem paginação/`include:{course:true}` → PERF-003. Leads (admin+painel) sem `take` → PERF-004. Exports CSV sem cap → PERF-012.
- **Bounded/OK (N/A):** `api/loja/courses` (pagina), `painel/alunos`/`admin/alunos` (paginam), relatórios `lib/reports/definitions.ts`+`painel-definitions.ts` (cap `MAX_ROWS=10.000`), BI `lib/reports/bi/*` (tabelas `take:10/15/20/30/40`, KPIs via `aggregate`/`groupBy`, séries via `date_trunc`+`GROUP BY` no banco — `aggregations.ts`), placar snapshot (`take:12` + `groupBy`), `metrics/public` (count + revalidate), `loadShowcase` (`take:6`), catálogos de gestão `admin/catalogo`/`painel/cursos` (dataset ~112, com `select` — monitorar).
- `select('*')`/include gordo: `listTenantCatalog include:{course:true}` → PERF-003; demais grids usam `select`/`include` enxuto (OK).
- Agregações no banco: OK (`groupBy`/`count`/`aggregate`/`$queryRawUnsafe` com `date_trunc` em placar, metrics, relatórios, BI hub — sem N+1; `$queryRawUnsafe` usa whitelist de bucket + params `$N` para datas/tenant, seguro).

### Jobs longos / background — Seção 5
- Crons: sweep-expired/overdue, reactivate-paid, reconcile-tenant-payments → PERF-005 (serial/sem cap). `regenerate-all` → PERF-006. Webhook LMS catálogo → PERF-010 (sync completo no request, agravado por `course.updated`).
- **OK (batch/bounded):** `resync-lms-credentials`, `sync-lms-branding`, `resync-platform-passwords` (take+CONCURRENCY), `sync-progresso` (take+cursor), `sweep-visitor-events` (BATCH_SIZE), `cleanup-webhook-logs`, `referral-monthly-payout`, `sync-cursos`/`sync-cursos-lms`/`sync-day-update-lms` (bounded pelo catálogo).
- Bulk edit (admin/painel) → PERF-013 (updates sequenciais, cap 500/200).
- Webhooks: `asaas`/`mercadopago` idempotentes e enxutos (OK); `lms` → PERF-010.
- SSE: `placar/stream` + `painel/placar/stream` recomputam sem cache → PERF-011 (⚠️MIGRAÇÃO: timeout Traefik).
- MP installments (`api/aluno/comprar/installments`, `checkout/installments`, `loja/checkout/installments`): 1 HTTP ao MP por request, fail-open para síntese 1..12 — bounded, aceitável (N/A; monitorar debounce do BIN no client).
- ⚠️MIGRAÇÃO VPS filas: crons longos (PERF-005/006) → BullMQ + worker no Swarm.

### ⚠️MIGRAÇÃO Vercel→VPS (resumo)
- `@upstash/redis` REST (redis.ts, ratelimit.ts, proxy.ts) + CSP `*.upstash.io` → trocar por TCP (`ioredis`/`redis`) ou SRH. **P1 migração.**
- `output:'standalone'` **ausente** (PERF-009) — necessário p/ Docker Swarm.
- Otimizador de imagem (PERF-008): loader próprio (sharp/imgproxy/MinIO).
- Crons via Vercel/pg_cron → scheduler no Swarm (cron container ou BullMQ repeatable jobs).
- SSE `placar/stream`+`painel/placar/stream` (maxDuration 300) → timeout de proxy no Traefik; runtime Edge da Vercel some.
