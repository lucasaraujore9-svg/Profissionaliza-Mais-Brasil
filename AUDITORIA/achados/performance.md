# Achados — Domínio: performance
_Auditor read-only · 2026-06-20 · Nota do domínio: **6/10** · P0=0 · P1=3 · P2=4 · P3=2_

> Resiliência a outage do Redis (foco do fix `dcd03fd`): **OK** — todo `redis.*()` em try/catch;
> `runLimit` captura falha de comando; proxy fail-open na resolução; health/sync-log/handoff degradam
> sem derrubar. Nenhum achado aqui.

### [PERF-001] Cache de tenant em Redis é código morto — proxy e layout batem no DB a cada request
- **Severidade:** P1
- **Status:** Aberto
- **Local:** `src/proxy.ts:154-174` (lê `tenant:${slug}`) · `src/lib/redis/keys.ts:7` (`setTenant` grava `tenant:slug:${slug}`) · `src/lib/redis/tenant-cache.ts:30` (`setTenant` nunca chamado)
- **Evidência:** `grep "setTenant\b"` retorna só a definição — nenhum caller. O proxy lê `tenant:${slug}` que ninguém escreve (cache grava namespace diferente `tenant:slug:`). 100% cache-miss → todo request de vitrine cai no fallback `/api/internal/resolve-tenant` (1 fetch + 1 query Prisma). `getCurrentTenant` (`src/lib/tenant/current.ts:42`) também consulta DB a cada request (dedup só intra-request via `cache()`). TTL 5min documentado nunca exercido.
- **Impacto:** latência extra (DB + round-trip) em cada page-load de toda vitrine/custom domain; carga desnecessária no Postgres; "cache de 5min" do CLAUDE.md não existe na prática.
- **Correção:** (a) proxy lê `tenantBySlugKey(slug)`/`tenantByDomainKey()` de `keys.ts`; (b) chamar `setTenant(...)` no `/api/internal/resolve-tenant` após lookup (`route.ts:71-92`) com TTL; (c) `getCurrentTenant` consulta `getTenantBySlug/getTenantByDomain` antes do Prisma e popula em miss. Manter fail-open.
- **Verificação:** segundo request à mesma vitrine não dispara query Prisma (logar `cache.hit`); teste com Redis mockado.

### [PERF-002] Home pública e vitrine `force-dynamic` sem cache + fan-out serial de queries por seção
- **Severidade:** P1
- **Status:** Aberto
- **Local:** `src/app/(main)/page.tsx:7` · `src/app/loja/page.tsx:7` · `src/components/main/home/dynamic-home-sections.tsx:48-58` (loop `for...of` serial) · `src/lib/home/sections.ts:502+`
- **Evidência:** `grep unstable_cache|revalidateTag|"use cache"|next:{revalidate}` em `src/` → vazio (zero cache de dados cross-request). Home renderiza serial: `loadShowcase` + banners + `loadHomeSections` + N seções × ~2q cada (`sections.ts:594/610/653/673/744/751`), tudo `force-dynamic`.
- **Impacto:** TTFB/LCP ruins na página de maior tráfego (home PMB + cada vitrine), pico de carga no DB, sem reutilização entre visitantes.
- **Correção:** `unstable_cache` em `loadHomeSections`/`loadShowcase`/`resolveSectionCourses` com tags por escopo (`home:pmb`, `home:tenant:{id}`), TTL 60-300s + `revalidateTag` nos endpoints de edição. Paralelizar o loop com `Promise.all`. Remover `force-dynamic` onde o cache cobrir (isolar leitura de cookie de bestsellers em Suspense).
- **Verificação:** TTFB antes/depois; nº de queries por request via log.

### [PERF-003] Catálogo público sem paginação e com include completo — `/cursos` e `/loja/cursos`
- **Severidade:** P1
- **Status:** Aberto
- **Local:** `src/lib/catalog/home.ts:242-293` (`loadCatalogo` sem `take`) chamado em `(main)/cursos/page.tsx:17,25` · `src/lib/tenant/courses.ts:239-248` (`listTenantCatalog` sem `take`/`skip`, `include:{course:true}`) chamado em `loja/cursos/page.tsx`
- **Evidência:** `loadCatalogo({})` retorna TODOS os cursos ATIVO (112+). `listTenantCatalog` faz `findMany` sem `take`/`skip` com `course:true` (todas as colunas). Contraste: `listTenantCourses` e `api/loja/courses` paginam; a versão pública não.
- **Impacto:** payload/render crescem linearmente sem teto; colunas não exibidas; LCP/transfer ruins em duas páginas de alto tráfego SEO.
- **Correção:** paginação (keyset por `nome` ou take/skip + "carregar mais"); `select` só das colunas do card em vez de `include:{course:true}`; `take` padrão 24 em `loadCatalogo`.
- **Verificação:** `/cursos` e `/{slug}.livrecursos.com.br/cursos` retornam ≤ pageSize; payload estável.

### [PERF-004] Boards de leads carregam TODOS os leads sem `take` (admin e painel)
- **Severidade:** P2
- **Status:** Aberto
- **Local:** `src/app/api/admin/leads/route.ts:51-70` · `src/app/api/painel/leads/route.ts:50-70`
- **Evidência:** ambos `studentLead.findMany` sem limite; leads crescem sem teto; kanban serializa tudo em memória.
- **Impacto:** com histórico grande, resposta lenta; degradação progressiva.
- **Correção:** limitar por coluna/stage; arquivar WON/LOST antigos.
- **Verificação:** endpoint retorna conjunto limitado; tempo estável com volume.

### [PERF-005] Crons de varredura sem cap/batch fazem IO sequencial por item
- **Severidade:** P2
- **Status:** Aberto
- **Local:** `cron/sweep-students-expired/route.ts:66-95,98` · `reactivate-paid/route.ts:76-93` · `sweep-students-overdue/route.ts:40-69`
- **Evidência:** `findMany` sem teto; `for (const enrollment of expired) { await blockStudentInEA(); await sendEmail(); }` serial com IO externo por iteração; `maxDuration=300`.
- **Impacto:** com backlog, estoura 300s e falha sem progresso parcial garantido.
- **Correção:** lotes com `take`+cursor (continua na próxima execução) e/ou concorrência limitada (`p-limit`); idempotência por status já existe. ⚠️MIGRAÇÃO: worker BullMQ.
- **Verificação:** duração com volume sintético; reprocessamento incremental sem duplicar efeitos.

### [PERF-006] `regenerate-all` de certificados gera todos os PDFs dentro do request
- **Severidade:** P2
- **Status:** Aberto
- **Local:** `src/app/api/admin/certificates/regenerate-all/route.ts:41-65`
- **Evidência:** `findMany` sem `take`; loop `Promise.allSettled` render PDF + upload S3 por item; `maxDuration=300`; resposta all-or-nothing.
- **Impacto:** centenas de certificados estouram 300s; sem cursor/resume, sem progresso parcial.
- **Correção:** delegar a background (n8n/cron paginado com cursor + flag pendente) ou lote com `?afterId=`. ⚠️MIGRAÇÃO: BullMQ.
- **Verificação:** regeneração de N>limite conclui sem timeout, progresso observável.

### [PERF-007] N+1 no fan-out de notificações por usuário (ROLE/TENANT broadcast)
- **Severidade:** P2
- **Status:** Aberto
- **Local:** `src/lib/notifications.ts:203-209,243-249` chamam `isChannelEnabled` (`:145` `notificationPreference.findFirst`) 1×/usuário via `Promise.all(users.map(...))`
- **Evidência:** broadcast a N usuários executa N queries `findFirst`.
- **Impacto:** N queries por broadcast; piora com crescimento de usuários.
- **Correção:** único `findMany({ where:{ userId:{in:[...]}, category } })` + resolver flags em memória.
- **Verificação:** broadcast a N usuários dispara 1 query de preferências.

### [PERF-008] `images.unoptimized: true` global desliga otimização de imagem ⚠️MIGRAÇÃO
- **Severidade:** P3
- **Status:** Aberto (verificação manual de infra)
- **Local:** `next.config.ts` (`images.unoptimized: true`)
- **Evidência:** comentário no config — desligado por cota Vercel esgotada (402). `next/image` serve tamanho cheio. App usa `next/image` corretamente (2 `<img>` são `data:` QR legítimos).
- **Impacto:** capas/banners/logos em tamanho cheio → LCP/CLS/transfer piores.
- **Correção:** reativar Image Optimization na Vercel + remover flag. ⚠️MIGRAÇÃO VPS: loader próprio (imgproxy/sharp no standalone) ou MinIO+transformação. Decisão de infra → manual.
- **Verificação:** `/_next/image` serve webp redimensionado; LCP melhora.

### [PERF-009] Sem `@next/bundle-analyzer` — sem visibilidade do bundle client
- **Severidade:** P3
- **Status:** Aberto
- **Local:** `package.json` (ausente)
- **Evidência:** libs pesadas já isoladas (jspdf/xlsx/gsap/driver.js dynamic; @react-pdf+qrcode server-external), mas sem gate de regressão.
- **Correção:** `@next/bundle-analyzer` (dev) com `ANALYZE=1`; opcional no CI.
- **Verificação:** `ANALYZE=1 next build` gera treemap.

## Cobertura
- Cache Redis/Upstash: resiliência OK; cache de tenant → PERF-001. 13 crons: sweep-expired/overdue+reactivate → PERF-005; demais OK (batch/bounded).
- Listagens: `/cursos`+`/loja/cursos` → PERF-003; leads → PERF-004; alunos/financeiro/loja/courses/equipe OK. Relatórios capados (10000) OK; analytics exemplar.
- N+1: notifications → PERF-007; reports nested-include OK. SSR/dynamic: home/loja → PERF-002; 58/124 force-dynamic justificados; sitemap/llms.txt revalidate OK.
- Bundle: dynamic OK; analyzer → PERF-009. next/image: OK; otimização global → PERF-008. next/font OK. regenerate-all → PERF-006.
- ⚠️MIGRAÇÃO: @upstash/redis REST (redis.ts, ratelimit.ts, proxy.ts:163,184, redis/cache.ts:36) + CSP upstash.io → não falam TCP (P1 migração); proxy Edge; `output:standalone` ausente; otimizador de imagem; filas BullMQ p/ crons longos.
