# Auditoria — DevOps & Migração (Vercel → VPS)
_Data: 2026-06-24 · Referência: .claude/skills/auditoria-saas/references/08-devops-migracao.md · Itens do inventário/área DevOps cobertos: 22/22_

## Resumo
- Itens verificados: 22 · Achados: P0=0 P1=5 P2=4 P3=2 · Nota do domínio: 6/10
- **Mudanças vs auditoria de 2026-06-20:** o P0 anterior (OPS-001, bootstrap em DB novo apagava a
  primeira migração) foi **CORRIGIDO** (commit `f27deb8` + guarda `coreSchemaExists` em
  `apply-pending-migrations.mjs:111-119,234-245`) — restou só o acoplamento build↔schema-prod, agora P1.
  OPS-006 (cron `reconcile-tenant-payments` não agendado) → **CORRIGIDO** (pg_cron_jobs.sql:83-84).
  OPS-012 (CI sem `build`) → **CORRIGIDO** (ci.yml:49-53, job "Lint + Typecheck + Test + Build").
- O deploy atual (Vercel + push→main) ficou mais sólido (CI com build + skip de migração no gate;
  runner de migration com lock não-bloqueante e detecção de DB vazio). A **prontidão para a migração
  VPS/Swarm continua baixa**: sem `output:'standalone'`, sem Dockerfile/.dockerignore/compose/stack,
  sem Traefik, sem cliente Redis TCP, sem MinIO, sem pgBouncer, sem plano de cutover/ADR-002. Cada um é
  achado ⚠️MIGRAÇÃO abaixo.
- Achado NOVO: drift `.env.example` ↔ `env.ts` (OPS-014) — `PMB_WEBHOOK_SECRET` (feature de webhook do
  LMS já em produção) está em `env.ts` mas FALTA no `.env.example`, que afirma estar em sincronia.

## Achados

### [OPS-001] `npm run build` aplica migrations na PROD durante o build (acoplamento build↔schema-prod)
- **Severidade:** P1
- **Status:** Aberto
- **Local:** package.json:7 (`"build": "npm run db:apply-pending && next build"`) · scripts/apply-pending-migrations.mjs:54 (`DIRECT_URL ?? DATABASE_URL`) · prisma.config.ts
- **Evidência:** O script `build` ainda executa `node scripts/apply-pending-migrations.mjs` ANTES de
  `next build` (package.json:7), abrindo conexão direta ao Postgres e aplicando todo
  `prisma/migrations/*/migration.sql` ainda não rastreado em `_pmb_applied_migrations`. **O cenário
  P0 anterior foi mitigado**: a heurística de bootstrap agora distingue DB existente de DB vazio via
  `coreSchemaExists()` (apply-pending-migrations.mjs:111-119) e, em DB vazio (caso VPS), aplica TODAS
  as migrations em ordem em vez de só marcá-las (linhas 234-245; commit `f27deb8`). Restou o
  acoplamento: qualquer `next build` apontando para a env de PROD altera o schema do banco — não há
  etapa de aprovação/janela. Não existe `prisma migrate deploy` (só comentário em
  apply-pending-migrations.mjs:6-7). O `migrate deploy` canônico foi substituído pelo runner caseiro.
- **Impacto:** Em prod: um build com `DATABASE_URL`/`DIRECT_URL` de prod (rollback de deploy,
  build manual, preview mal configurado) dispara DDL em produção sem revisão. Severidade P1 (o pior
  caso — apagar a 1ª migração num DB novo — já está coberto).
- **Correção:**
  1. Remover `db:apply-pending` do script `build` (package.json:7 → `"build": "next build"`).
  2. Criar script de deploy separado `"db:migrate": "node scripts/apply-pending-migrations.mjs"` e
     chamá-lo num passo de deploy explícito (job dedicado / comando manual), NUNCA dentro de `next build`.
  3. No mecanismo de deploy atual (Vercel build = deploy), introduzir um gate: rodar o runner como
     step pré-build separado no pipeline (não no `package.json#build`), de modo que `next build` local
     ou de preview nunca toque o banco. Documentar `SKIP_PENDING_MIGRATIONS=1` como default em qualquer
     build que não seja o de deploy de prod.
- **Verificação:** `grep -n "db:apply-pending" package.json` não aparece no script `build`;
  `npm run build` local (sem env de prod) compila sem abrir conexão ao Postgres de produção; rodar o
  runner contra um Postgres efêmero VAZIO cria as 44 tabelas (`\dt` lista todas).

### [OPS-002] ⚠️MIGRAÇÃO — `next.config.ts` sem `output: 'standalone'`; nenhum Dockerfile/.dockerignore/compose/stack
- **Severidade:** P1
- **Status:** Aberto
- **Local:** next.config.ts:44-98 (config sem `output`) · raiz do repo (ausência de Dockerfile, .dockerignore, docker-compose.yml, docker-stack.yml, .nvmrc — confirmado por `find`)
- **Evidência:** `grep -n "output\|standalone" next.config.ts` → nenhum resultado. `find` por
  `Dockerfile*`/`docker-compose*`/`docker-stack*`/`compose.y*ml`/`.nvmrc` em todo o repo (exceto
  node_modules/.git) → vazio. Sem `output:'standalone'`, o `next build` não emite `.next/standalone/
  server.js` que o container precisa para rodar sem `node_modules` completos.
- **Impacto:** Impossível containerizar o Next para o Swarm sem antes adicionar isto. Sem Dockerfile
  multi-stage + `.dockerignore`, a imagem fica gigante e arrisca embutir `.env`/segredo em layer (P1
  pela referência §4).
- **Correção:** (a) Adicionar `output: "standalone"` ao `nextConfig` em next.config.ts. (b) Criar
  Dockerfile multi-stage (deps → build → runner), `USER node` (não-root), copiar `.next/standalone`,
  `.next/static` e `public`, `EXPOSE 3000`, `CMD ["node","server.js"]`. (c) Criar `.dockerignore`
  (node_modules, .next, .git, .env*, auditoria/, audit/, docs/, .mcp.json). (d) Pinar a base do Node
  na imagem (ver OPS-009). (e) Healthcheck do container apontando para `/api/health` (já existe,
  profundo DB+Redis — health/route.ts:36-71).
- **Verificação:** após `output:'standalone'`, `next build` gera `.next/standalone/server.js`;
  `docker build` produz imagem que sobe e responde `/api/health` 200; `docker history` não mostra
  segredo em nenhuma layer.

### [OPS-003] ⚠️MIGRAÇÃO — Redis via `@upstash/redis` (REST) não fala TCP; trocar por `ioredis`/`redis` ou SRH
- **Severidade:** P1
- **Status:** Aberto
- **Local:** src/lib/redis.ts:1,21 · src/lib/ratelimit.ts:1-2,9 · src/proxy.ts:152-155,174-176 (fetch REST direto `${UPSTASH_REDIS_REST_URL}/get/...`) · package.json:29-30 (`@upstash/ratelimit`, `@upstash/redis`)
- **Evidência:** `grep -rn "@upstash/" src` → 2 imports vivos: `redis.ts` (`new Redis({url,token})`) e
  `ratelimit.ts` (`Redis` + `Ratelimit`). Além disso o proxy NÃO usa o SDK: faz `fetch` HTTP direto
  contra a REST API do Upstash em proxy.ts:152-155 (`/get/tenant:slug:${slug}`) e proxy.ts:174-176
  (`/get/tenant:redirect:${slug}`). O cliente REST do Upstash **não** conversa com Redis TCP self-hosted.
- **Impacto:** No Swarm com Redis TCP, cache de tenant (proxy), rate-limit (ratelimit.ts) e os
  redirects de slug param de funcionar. Para buckets fail-closed em prod (ratelimit.ts:68,136), um
  Redis "presente mas incompatível" derruba o request com a política de negação.
- **Correção:** Trocar `@upstash/redis`/`@upstash/ratelimit` por `ioredis` — OU rodar um SRH
  (Serverless-Redis-HTTP) que preserva a interface REST. Pontos a refatorar: (1) `redis.ts`
  `createRedisClient` → `new Redis(REDIS_URL)` (ioredis) com guarda de URL ausente; (2) `ratelimit.ts`
  → o `@upstash/ratelimit` não aceita client `ioredis`; migrar para `rate-limiter-flexible` ou
  sliding-window próprio em Lua, **mantendo** o tratamento de falha de comando (runLimit, ratelimit.ts:
  118-144) e os buckets `RATE_LIMITS`; (3) `proxy.ts` — substituir os dois `fetch` REST por chamada ao
  client TCP OU manter só o fallback `/api/internal/resolve-tenant` (já existe) removendo o caminho
  Redis-REST do middleware (ver OPS-004). (4) Atualizar CSP `connect-src` (next.config.ts:33 hoje
  libera `*.upstash.io`) e `.env.example` para o endpoint TCP.
- **Verificação:** `grep -rn "@upstash/" src` → vazio; cache de tenant e rate-limit testados contra um
  Redis TCP local (`redis-cli ping` + hit no proxy + 429 controlado).

### [OPS-004] ⚠️MIGRAÇÃO — `proxy.ts` assume premissas de Edge-runtime; revalidar para Node no Swarm
- **Severidade:** P1
- **Status:** Aberto
- **Local:** src/proxy.ts (arquivo inteiro; matcher :372-376; fetch REST :152,174) · src/lib/redis.ts:9 (comentário "esse módulo roda no middleware"/edge) · src/instrumentation.ts:13 (`if NEXT_RUNTIME !== "nodejs" return`)
- **Evidência:** O middleware do Next roda no Edge na Vercel — por isso o proxy usa `fetch` REST ao
  Upstash (proxy.ts:152,174) e o resolve de tenant via hop HTTP a `/api/internal/resolve-tenant`
  (proxy.ts:201-225), evitando Prisma (CLAUDE.md: "Proxy roda no Edge Runtime — NAO pode usar Prisma
  direto"). Em Docker Swarm não há Edge: o middleware roda em Node no `server.js`. O código em si é
  Node-compatível (sem `request.geo`/`request.ip` — `grep` confirma ausência), mas as **premissas**
  (sem Prisma, Redis só via REST) deixam de fazer sentido.
- **Impacto:** Funcionalmente o middleware segue rodando em Node (não quebra por si), mas mantém-se a
  dependência REST do Upstash sem necessidade e o hop HTTP interno extra. Sem revisão, carrega a dívida
  do OPS-003 para o self-host.
- **Correção:** Na migração, decidir e documentar: (a) middleware Node resolvendo tenant via Prisma
  direto (elimina o hop REST→`/api/internal/resolve-tenant` e o Redis-REST), OU (b) manter o hop interno
  trocando o Redis REST por TCP (OPS-003). Revalidar `instrumentation.ts:13` (`NEXT_RUNTIME` continua
  "nodejs" no self-host — ok) e remover os comentários "edge-only" obsoletos em redis.ts:9.
- **Verificação:** middleware resolve tenant em ambiente Node self-host (subdomínio e custom domain)
  sem depender de Upstash REST; `grep "edge" src/proxy.ts src/lib/redis.ts` revisado.

### [OPS-005] ⚠️MIGRAÇÃO — Storage acoplado à Supabase Storage REST; migrar para MinIO (S3)
- **Severidade:** P1
- **Status:** Aberto
- **Local:** src/lib/supabase/storage.ts:1-94 (bucket `vitrine-assets`, paths `/storage/v1/object/{public}/...`) · src/lib/certificates/storage.ts:1-153 (bucket `certificates`, signed URLs `/storage/v1/object/sign/...`) · src/lib/packages/cover-upload.ts
- **Evidência:** Toda I/O de arquivos usa a REST API do Supabase Storage com
  `SUPABASE_SERVICE_ROLE_KEY` e paths hardcoded `${url}/storage/v1/object/{public|sign}/${BUCKET}/...`
  (storage.ts:44,47,70,75; certificates/storage.ts:47,84,99,121,145). URLs públicas de capas e
  certificados são persistidas no banco nesse formato. CSP já libera `*.supabase.co`
  (next.config.ts:29,33).
- **Impacto:** Em MinIO os endpoints/headers (S3 SigV4) e o formato de URL pública mudam. As URLs já
  persistidas (capas de curso/pacote, PDFs de certificado) deixam de resolver após o cutover se o
  host/path mudar — quebra imagens e download de certificado.
- **Correção:** (a) Trocar os clients por SDK S3 (`@aws-sdk/client-s3`) apontando para o endpoint
  MinIO; recriar buckets `vitrine-assets` (público) e `certificates` (privado + presigned via
  `createSignedCertificateUrl`, certificates/storage.ts:94 já é a abstração). (b) Migrar os objetos
  (Supabase → MinIO) e **reescrever as URLs persistidas** (`Course.coverImageUrl`, capas de
  `CoursePackage`, `Certificate.pdfUrl`, logos de tenant/grupo). (c) Ajustar CSP `img-src`/`connect-src`
  (next.config.ts:29,33) para o host do MinIO (`s3.bmbr.com.br` já está em `img-src` mas NÃO em
  `connect-src`). (d) Ajustar `extractAssetPath`/`extractCertificatePath` aos novos markers de path.
- **Verificação:** upload de capa e emissão/validação de certificado funcionam contra MinIO; nenhuma
  404 em `Course.coverImageUrl`/`Certificate.pdfUrl` após reescrita das URLs.

### [OPS-006] ⚠️MIGRAÇÃO — Dependências e API Vercel-específicas (`@vercel/analytics`/`speed-insights` + domínios custom)
- **Severidade:** P2
- **Status:** Aberto
- **Local:** src/components/shared/analytics-gate.tsx:3-4,10-17 · package.json:31-32 · src/lib/vercel/client.ts:1-133 (gerencia domínios via `api.vercel.com`) · src/lib/tenant/urls.ts:75-76 (`vercelApexIp()` default `216.198.79.1`) · /api/painel/dominio + /painel/dominio (consumidores)
- **Evidência:** `grep -rn "@vercel/" src` → `Analytics` + `SpeedInsights` em analytics-gate.tsx
  (no-op fora da Vercel — peso morto). `src/lib/vercel/client.ts` faz toda a anexação de domínio custom
  de revenda via Vercel Project Domains API (addProjectDomain/verify/remove/get) — é o mecanismo de
  wildcard + custom domain + SSL automático da Vercel. `urls.ts:75-76` devolve o IP de apex da Vercel.
  CSP referencia `va.vercel-scripts.com`/`vitals.vercel-insights.com` (next.config.ts:32-33).
- **Impacto:** Fora da Vercel: (1) Analytics/SpeedInsights não coletam nada (perde-se observabilidade
  "de graça" — cobrir self-hosted no domínio observabilidade). (2) **CRÍTICO p/ negócio:** o fluxo de
  domínio próprio de revenda (anexar apex+www, emitir SSL) some — em Traefik vira gestão dinâmica de
  router + Let's Encrypt por domínio, a reimplementar. Sem isso, revendas com domínio próprio ficam sem
  HTTPS/roteamento.
- **Correção:** (a) Remover `@vercel/analytics` + `@vercel/speed-insights` e o `AnalyticsGate` (ou
  trocar por alternativa self-hosted) + limpar CSP (next.config.ts:32-33). (b) Reimplementar
  `src/lib/vercel/client.ts` como provider de domínios para Traefik: ao anexar custom domain criar
  router + certresolver (Let's Encrypt) dinamicamente; ao remover, limpar. Ajustar `urls.ts:cnameTarget()`
  e `vercelApexIp()` para o IP/CNAME da VPS. (c) Wildcard `*.livrecursos.com.br`: cert wildcard via
  DNS-01 no Traefik.
- **Verificação:** `grep -rn "@vercel/" src` → vazio; anexar um domínio custom de teste gera router
  Traefik + cert válido; `*.livrecursos.com.br` resolve com cert wildcard.

### [OPS-007] ⚠️MIGRAÇÃO — Sem Docker Swarm secrets; app lê segredos de alto poder de env
- **Severidade:** P2
- **Status:** Aberto
- **Local:** scripts/apply-pending-migrations.mjs:54 (`DIRECT_URL`/`DATABASE_URL`) · src/lib/supabase/storage.ts:5 + src/lib/certificates/storage.ts:5 (`SUPABASE_SERVICE_ROLE_KEY`) · src/lib/env.ts:62,89,90,102 · .env.example:25-30
- **Evidência:** A app depende de segredos de alto poder em env: `SUPABASE_SERVICE_ROLE_KEY` (poder
  total no storage/DB), `ENCRYPTION_KEY`, `CRON_SECRET`, `INTERNAL_SECRET`, `ASAAS_API_KEY`,
  `MP_WEBHOOK_SECRET`, `PMB_WEBHOOK_SECRET`, `LMS_API_KEY`, `VAPID_PRIVATE_KEY`, `SMTP_PASSWORD`. Hoje
  injetados como env na Vercel. Não há mecanismo de Swarm secrets no repo (sem compose/stack — OPS-002).
- **Impacto:** Na VPS, sem Swarm secrets esses valores cairiam num `.env` no host ou em layer de imagem
  (a referência §4 classifica como P1). `SUPABASE_SERVICE_ROLE_KEY` vazado = controle total do storage.
- **Correção:** Definir `secrets:` no `docker-stack.yml` (Swarm) e ler via arquivos em `/run/secrets/*`.
  Atualizar `src/lib/env.ts` para aceitar `*_FILE` (ler o conteúdo do arquivo quando a env aponta para
  um path), começando pelos de maior poder (SERVICE_ROLE_KEY, ENCRYPTION_KEY, DATABASE_URL/DIRECT_URL,
  ASAAS_API_KEY, LMS_API_KEY, PMB_WEBHOOK_SECRET). NUNCA commitar o stack com valores.
- **Verificação:** `docker stack` sobe lendo de `/run/secrets`; nenhum segredo em `docker history` nem
  no `.env` do host.

### [OPS-008] ⚠️MIGRAÇÃO — Pooling Supavisor → pgBouncer; backups não testados
- **Severidade:** P2
- **Status:** Aberto
- **Local:** src/lib/prisma.ts:15-20 (Pool pg sobre `DATABASE_URL`, `max` configurável) · prisma.config.ts + scripts/apply-pending-migrations.mjs:54 (migrations usam `DIRECT_URL`) · .env.example:16-19
- **Evidência:** Runtime usa `DATABASE_URL` (pooled Supavisor) com `Pool` do `pg` (prisma.ts:15) e teto
  `DATABASE_POOL_MAX` (default 10); migrations usam a conexão DIRETA `DIRECT_URL` de propósito
  (apply-pending-migrations.mjs:49-54). Não há backup/restore documentado no repo (Supabase Cloud
  gerencia backup hoje, conforme memória do projeto).
- **Impacto:** Self-hostando Postgres, o Supavisor some: é preciso pgBouncer em transaction-mode; o teto
  de 60 conexões citado em prisma.ts:10-13 muda. Sem backup testado (pg_dump/pg_basebackup + WAL/PITR +
  restore validado), perda de dados não tem recuperação (P1 da referência §4; aqui P2 por ser planejamento).
- **Correção:** (a) Provisionar pgBouncer (transaction pooling); apontar `DATABASE_URL` para ele,
  mantendo `DIRECT_URL` direto ao Postgres para migrations. (b) Revisar `max` do Pool (prisma.ts:17) em
  função do pool do pgBouncer. (c) Definir e **testar** backup: `pg_dump`/`pg_basebackup` + WAL
  archiving + restore num host limpo, agendado e monitorado. (d) Sem RLS no banco (isolamento em código),
  recriar apenas extensões usadas (`pg_cron`, `pg_net`) e roles — não há policies para portar.
- **Verificação:** app sobe contra pgBouncer sem esgotar conexões sob carga; restore de backup recente
  reconstrói o banco num host limpo (drill documentado).

### [OPS-009] ⚠️MIGRAÇÃO — Crons via Supabase pg_cron (`pg_net`→endpoint HTTP); precisam de scheduler próprio na VPS
- **Severidade:** P2
- **Status:** Aberto
- **Local:** prisma/sql/pg_cron_jobs.sql:1-85 (14 jobs via `app_internal.run_cron` → `net.http_post`) · src/app/api/cron/** (16 handlers) · vercel.json (`crons: []`)
- **Evidência:** O scheduler canônico é o Supabase pg_cron disparando `app_internal.run_cron(path)` que
  faz `net.http_post` (pg_net) para `/api/cron/*` com `Authorization: Bearer CRON_SECRET`
  (pg_cron_jobs.sql:11-21). `vercel.json` = `{"crons":[]}` (plano Hobby). `pg_cron` e `pg_net` são
  extensões do Supabase. A memória do projeto registra que TODOS os jobs falharam (30/04–10/06) quando
  `pg_net` mudou de schema — sinal de fragilidade do acoplamento.
  - Dos 16 handlers em disco, 13 estão agendados; 3 são endpoints de **reparo/backfill sob demanda**
    (NÃO crons periódicos, por design): `resync-platform-passwords` (memória: "sem cron agendado, por
    escolha do dono"), `resync-lms-credentials` (route.ts:11-23 "reparo"), `sync-lms-branding`
    (route.ts:11-21 "backfill ... cobre o retroativo"). Estes são N/A para agendamento.
- **Impacto:** Postgres self-hosted comum não tem `pg_cron`/`pg_net` por padrão. Sem eles, **nenhum
  cron periódico roda** (sync de catálogo EA/LMS, bloqueio de inadimplentes, payout de comissões,
  reconciliação de mensalidades, day-update LMS...) — impacto operacional severo e silencioso.
- **Correção:** Escolher um scheduler na VPS: (a) instalar `pg_cron`+`pg_net` no Postgres self-hosted e
  recriar `app_internal.run_cron` + os 13 jobs; OU (b) trocar por cron de sistema/container (serviço no
  Swarm com `curl` autenticado, ofelia, ou GitHub Actions schedule) chamando `/api/cron/*` com o
  `CRON_SECRET`. Documentar no plano de cutover (ADR-002). Manter `pg_cron_jobs.sql` versionado.
- **Verificação:** os 13 handlers periódicos têm um agendador ativo na VPS; uma execução de teste de
  cada retorna 200 e loga o evento.

### [OPS-010] Versão do Node não pinada (sem `engines`/`.nvmrc`); CI fixa em 20, prod/imagem indefinidos
- **Severidade:** P2
- **Status:** Aberto
- **Local:** package.json (sem `engines`/`packageManager` — `grep` confirma) · ausência de `.nvmrc` (confirmado por `find`) · .github/workflows/ci.yml:25 (`node-version: 20`)
- **Evidência:** `grep "engines\|packageManager" package.json` → nada; `.nvmrc` inexistente. O CI roda
  em Node 20 (ci.yml:25), mas nada garante paridade com o runtime da Vercel nem com a imagem base do
  futuro Dockerfile. Next 16 + Prisma 7 + React 19.2 são sensíveis à major do Node.
- **Impacto:** Risco de "passa no CI, quebra em prod" por divergência de major do Node; na VPS, a
  imagem Docker fica sem fonte de verdade de versão (paridade dev/staging/prod — referência §3).
- **Correção:** Adicionar `"engines": { "node": ">=20 <21" }` (ou a versão exata usada) em package.json
  e criar `.nvmrc` com a mesma versão; usar essa versão como base da imagem Docker (OPS-002) e no
  `actions/setup-node` (ci.yml:24-25).
- **Verificação:** `node -v` em CI, Dockerfile e `.nvmrc` coincidem.

### [OPS-011] Sem ambiente de staging/homologação e sem plano de cutover (ADR-002 ausente)
- **Severidade:** P3
- **Status:** Aberto
- **Local:** vercel.json (só `crons:[]`) · .github/workflows/ci.yml (sem deploy de staging) · docs/architecture/ (sem ADR-002 / sem doc de migração — confirmado por `ls`/`find`)
- **Evidência:** Não há referência a ambiente de homologação fiel em vercel.json/ci.yml/next.config.ts;
  não existe Dockerfile/compose/stack (OPS-002) nem doc de cutover/migração (`find` por
  deploy/runbook/docker/swarm/traefik/minio = vazio; `ADR-002` ausente — a memória do projeto registra
  "ADR-002 a escrever").
- **Impacto:** A referência §3/§4 exige "staging fiel" para ensaiar a migração antes da prod. Sem ele e
  sem plano de cutover documentado, o cutover Vercel→VPS é testado direto em produção — risco alto numa
  migração com Redis TCP, MinIO, pgBouncer, Traefik e scheduler novo em jogo.
- **Correção:** (a) Escrever ADR-002 (infra VPS) com o plano de cutover: DNS/TTL, janela, ordem de
  migração de dados (DB, storage), rollback, verificação pós-migração (rodar `/auditoria` + Portão
  Zero-Erro na VPS). (b) Provisionar stack de staging na VPS (mesma versão de Node/Postgres/Redis/MinIO,
  dados realistas anonimizados) e ensaiar o cutover lá.
- **Verificação:** ADR-002 existe com checklist de cutover; stack de staging responde `/api/health` 200
  com todas as integrações; o ensaio foi executado e registrado.

### [OPS-012] Drift `.env.example` ↔ `env.ts`: `PMB_WEBHOOK_SECRET` (webhook LMS em prod) ausente do exemplo
- **Severidade:** P3
- **Status:** Aberto
- **Local:** .env.example (sem `PMB_WEBHOOK_SECRET` — `grep -c` = 0) vs src/lib/env.ts:86 (declarado) · .env.example:110-112,89-92,76-77,87 (`WA_GATEWAY_*`, `VERCEL_APEX_IP` ausente do schema, `MP_WEBHOOK_DEV_BYPASS`, `PMB_SUPPORT_EMAIL`) vs src/lib/env.ts (não declarados)
- **Evidência:** O `.env.example` afirma na linha 5: "Mantenha este arquivo em sincronia com
  src/lib/env.ts". Há drift nas duas direções:
  - Em `env.ts` mas FALTA no `.env.example`: `PMB_WEBHOOK_SECRET` (env.ts:86) — secret do webhook do
    LMS, feature já em produção (commit `2f2f708`). Onboarding novo não sabe configurá-la → o receiver
    `/api/webhooks/lms` responde 503 silenciosamente (route.ts:42-52).
  - Lidas via `process.env` direto mas FORA do schema `env.ts` (sem validação/tipagem):
    `WA_GATEWAY_URL`/`WA_GATEWAY_API_KEY` (src/lib/automation/wa-client.ts:23-24), `VERCEL_APEX_IP`
    (src/lib/tenant/urls.ts:76), `MP_WEBHOOK_DEV_BYPASS` (.env.example:77), `PMB_SUPPORT_EMAIL`
    (.env.example:87). O CLAUDE.md/guardrails do projeto pedem "NÃO leia `process.env.X` direto — sempre
    via env.ts".
- **Impacto:** Onboarding de dev não reproduzível para a feature de webhook LMS (referência §3,
  ".env.example cobre tudo"); envs lidas fora do schema não têm fail-fast nem tipagem. Baixo, mas é
  exatamente o tipo de gap que faz a migração para a VPS perder uma env.
- **Correção:** (a) Adicionar ao `.env.example` um bloco `PMB_WEBHOOK_SECRET=` (com comentário: HMAC do
  webhook de ENTRADA do LMS, >=16 chars, opcional). (b) Mover `WA_GATEWAY_URL`/`WA_GATEWAY_API_KEY`,
  `VERCEL_APEX_IP`, `MP_WEBHOOK_DEV_BYPASS`, `PMB_SUPPORT_EMAIL` para o schema `envSchema` em env.ts
  (todas `.optional()`), e consumi-las via `env.*` em wa-client.ts/urls.ts. (c) Revisar a sincronia
  bidirecional `env.ts` ⇄ `.env.example` (idealmente um teste que falha quando divergem).
- **Verificação:** `grep -c "PMB_WEBHOOK_SECRET" .env.example` → 1; toda chave lida via `process.env`
  em src/ (exceto NEXT_PHASE/NODE_ENV/NEXT_RUNTIME) tem entrada em `env.ts` e no `.env.example`.

## Cobertura
_Itens do inventário/área DevOps relevantes a este domínio e veredito de cada um._

| Item | Veredito |
|---|---|
| `package.json` (scripts build/typecheck/lint/test/db:*) | Achado OPS-001 (build aplica migration), OPS-010 (sem engines) |
| `next.config.ts` (headers segurança, images, CSP) | OK (HSTS/XCTO/XFO/Referrer/Permissions/CSP presentes; `unoptimized:true` por cota Vercel — contexto OPS-006); Achado OPS-002 (sem `output:'standalone'`); nota: `s3.bmbr.com.br` em `img-src` mas não em `connect-src` (OPS-005) |
| `vercel.json` | OK (`crons:[]` intencional, scheduler é pg_cron); contexto OPS-009 |
| `.env.example` | Achado OPS-012 (drift: falta `PMB_WEBHOOK_SECRET`; envs fora do schema). Sem valores reais; alerta correto sobre service_role/ACCESS_TOKEN |
| `src/lib/env.ts` (validação Zod fail-fast) | OK (schema completo, requiredInProd, assertEnv com warnings LMS/MP/Redis); contexto OPS-007 (`*_FILE` p/ Swarm), OPS-012 (envs externas ao schema) |
| `scripts/apply-pending-migrations.mjs` | Achado OPS-001 (acoplamento build↔schema); bootstrap-em-DB-novo CORRIGIDO (coreSchemaExists, commit f27deb8) |
| `prisma/sql/pg_cron_jobs.sql` | OK p/ cobertura (14 jobs, inclui reconcile-tenant-payments — OPS-006 anterior CORRIGIDO); Achado OPS-009 (⚠️MIGRAÇÃO pg_cron/pg_net) |
| `prisma.config.ts` | OK (schema/migrations/datasource via DIRECT_URL) |
| `src/lib/prisma.ts` (Pool pg) | Achado OPS-008 (⚠️MIGRAÇÃO Supavisor→pgBouncer) |
| `eslint.config.mjs` / `tsconfig.json` | OK (strict, noEmit, paths; lint no CI) |
| `.github/workflows/ci.yml` | OK (lint+typecheck+test+**build** no gate — OPS-012 anterior CORRIGIDO; `test`=`vitest run` não pendura); Achado OPS-010 (node 20 hardcoded), OPS-011 (sem staging) |
| Dockerfile / .dockerignore / compose / stack / .nvmrc | Achado OPS-002 + OPS-010 (ausentes — ⚠️MIGRAÇÃO; confirmado por `find` no repo) |
| `src/proxy.ts` (middleware multi-tenant) | Achado OPS-004 (⚠️MIGRAÇÃO premissas Edge), OPS-003 (Redis REST direto :152,174) |
| `src/lib/redis.ts` + `src/lib/ratelimit.ts` (@upstash) | Achado OPS-003 (⚠️MIGRAÇÃO REST→TCP); ratelimit com fallback de falha de comando OK |
| `src/lib/supabase/storage.ts` + `src/lib/certificates/storage.ts` + `lib/packages/cover-upload.ts` | Achado OPS-005 (⚠️MIGRAÇÃO →MinIO) |
| `src/lib/vercel/client.ts` + `components/shared/analytics-gate.tsx` + `lib/tenant/urls.ts (vercelApexIp)` | Achado OPS-006 (⚠️MIGRAÇÃO domínios/SSL + analytics) |
| `src/app/api/health/route.ts` + `src/instrumentation.ts` | OK (health profundo DB+Redis 503/200, runtime nodejs, force-dynamic, maxDuration=10 — usável como healthcheck do container Traefik) |
| `src/lib/auth/bearer.ts` (cron/internal auth) | OK (timing-safe, exige secret em prod) — não re-detalhado (domínio seguranca/api) |
| Crons (16 handlers) — agendamento | OK 13 agendados; 3 on-demand por design (resync-platform-passwords, resync-lms-credentials, sync-lms-branding) — N/A agendamento; todos com `maxDuration` (16/16) |
| Webhooks (asaas/mercadopago/lms) — runtime/maxDuration | OK (lms: maxDuration=300, force-dynamic, HMAC, idempotente; asaas/mercadopago com runtime declarado) — assinatura/idempotência no domínio api |
| 75 migrations — idempotência p/ DB novo na VPS | OK no fluxo atual (DB existente bootstrapa); contexto: 6 migrations antigas têm `CREATE TABLE` sem `IF NOT EXISTS` (init + notifications + push) — só relevantes p/ re-rodar parcial em DB novo, que o runner aplica em ordem; `ALTER TYPE ADD VALUE` exige PG12+ no self-host (nota p/ ADR-002) |
| Segredos em arquivos rastreados | OK — `git ls-files` só lista `.env.example`/`.mcp.json.example` (sem valores); `.env*`/`.mcp.json` no .gitignore |
