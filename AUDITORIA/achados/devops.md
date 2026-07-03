# Auditoria — DevOps & Migração (Vercel → VPS)
_Data: 2026-07-03 · Referência: .claude/skills/auditoria-saas/references/08-devops-migracao.md · Itens do inventário/área DevOps cobertos: 23/23_

## Resumo
- Itens verificados: 23 · Achados: **P0=0 P1=6 P2=5 P3=1** · Nota do domínio: **6/10**
- **Re-verificação dos achados de 2026-06-24:**
  - **OPS-012** (drift `.env.example` ↔ `env.ts`) → **CORRIGIDO** (commit `d44c865`). `PMB_WEBHOOK_SECRET`
    agora está no `.env.example:68`, e `MP_WEBHOOK_DEV_BYPASS` (:81), `PMB_SUPPORT_EMAIL` (:93),
    `VERCEL_APEX_IP` (:101), `WA_GATEWAY_URL/API_KEY` (:120-121) foram documentados. Mantido como
    `Corrigido` abaixo (com nota residual de escopo `codigo`).
  - **OPS-001..OPS-011** → **todos continuam Abertos** (re-verificados arquivo-a-arquivo; sem regressão,
    sem correção). Nenhum Dockerfile/compose/stack/.nvmrc surgiu; `output:'standalone'` ainda ausente;
    `@upstash/*` e `@vercel/*` ainda vivos; storage ainda Supabase REST; sem `engines`; sem ADR-002.
- **Delta desde 2026-06-24** (git log): 40+ commits, majoritariamente feature (LMS catálogo/matriz,
  relatórios BI, checkout parcelas, placar). O único commit que toca infra de DevOps é `d44c865`
  (correção do OPS-012). O commit `a42ccb8` (domínio próprio só após 2 registros DNS) **aprofunda** o
  acoplamento à Vercel Domains API (`getDomainConfig` v6 em `vercel/client.ts`), reforçando OPS-006.
  Migrations subiram de 75 → **81**. Terceiro módulo de storage Supabase descoberto
  (`src/lib/storage/payout-proof.ts`) — incorporado ao OPS-005.
- **Achado NOVO — OPS-013 (P1, verificação manual):** os crons rodam **exclusivamente** via Supabase
  pg_cron aplicado **à mão** (`prisma/sql/pg_cron_jobs.sql` diz explicitamente "NÃO é rodado
  automaticamente pelo deploy — execução manual"). O repo não prova que os 13 jobs estão de fato
  `active` em produção; a memória do projeto registra que **TODOS os jobs ficaram parados de 30/04 a
  10/06** (mudança de schema do `pg_net`). Risco operacional silencioso de billing/matrícula.
- **Prontidão para migração VPS continua baixa.** A memória do projeto indica que a decisão de infra
  evoluiu (VPS + Cloudflare + Docker Compose + GitHub Actions SSH, "cenário C") — mas **nada disso está
  no repo**: sem ADR-002, sem Compose, sem Dockerfile, sem provider de Redis TCP/MinIO/pgBouncer. Todos
  os itens ⚠️MIGRAÇÃO abaixo permanecem pendentes.
- **Segredos no repo:** OK — `.env.vercel.production` e `.env.local` existem no working tree mas
  **não estão rastreados** (`.gitignore:19-20` `.env.vercel.*`; `git ls-files` só devolve
  `.env.example`/`.mcp.json.example`, sem valores). `.mcp.json` gitignored (:23).

## Achados

### [OPS-001] `npm run build` aplica migrations na PROD durante o build (acoplamento build↔schema-prod)
- **Severidade:** P1
- **Status:** Aberto
- **Local:** package.json:7 (`"build": "npm run db:apply-pending && next build"`) · package.json:8 (`db:apply-pending`) · scripts/apply-pending-migrations.mjs:54 (`DIRECT_URL ?? DATABASE_URL`)
- **Evidência:** O script `build` continua executando `node scripts/apply-pending-migrations.mjs` ANTES
  de `next build` (package.json:7). O runner abre conexão DIRETA ao Postgres (mjs:54, `DIRECT_URL ??
  DATABASE_URL`), pega advisory lock não-bloqueante (mjs:174-199) e aplica todo
  `prisma/migrations/*/migration.sql` ainda não rastreado em `_pmb_applied_migrations` (mjs:250-258).
  **O pior cenário está mitigado:** DB novo/vazio é distinguido de DB existente via `coreSchemaExists()`
  (mjs:111-119) — em DB vazio aplica TODAS as migrations em ordem (mjs:234-245), em DB existente só
  bootstrapa o tracking (mjs:234-239). **Restou o acoplamento:** qualquer `next build` apontando para a
  env de PROD executa DDL em produção sem etapa de aprovação/janela. Não existe `prisma migrate deploy`
  (só comentário em mjs:6-7). O gate de CI usa `SKIP_PENDING_MIGRATIONS=1` (ci.yml:33,51), então o CI
  não toca banco — mas o build de **deploy** (Vercel = build = deploy) toca.
- **Impacto:** Um build com `DATABASE_URL`/`DIRECT_URL` de prod (rollback de deploy, build manual,
  preview mal configurado) dispara DDL em produção sem revisão. Migrations não-idempotentes antigas
  (init/notifications/push têm `CREATE TABLE` sem `IF NOT EXISTS`) falhariam o build inteiro se
  re-aplicadas parcialmente.
- **Correção:**
  1. `package.json:7` → `"build": "next build"` (remover `db:apply-pending &&`).
  2. Criar `"db:migrate": "node scripts/apply-pending-migrations.mjs"` e chamá-lo como **step de deploy
     dedicado** (job separado no pipeline / comando manual), nunca dentro de `next build`.
  3. No mecanismo atual (Vercel build=deploy), mover o runner para um passo pré-build separado do
     pipeline, de modo que build local/preview jamais toque o banco. Documentar `SKIP_PENDING_MIGRATIONS=1`
     como default em qualquer build que não seja deploy de prod.
- **Verificação:** `grep -n "db:apply-pending" package.json` não aparece no script `build`;
  `npm run build` local (sem env de prod) compila sem abrir conexão; rodar o runner contra Postgres
  efêmero VAZIO cria as 81 migrations em ordem (`\dt` lista todas as tabelas).

### [OPS-002] ⚠️MIGRAÇÃO — `next.config.ts` sem `output: 'standalone'`; nenhum Dockerfile/.dockerignore/compose/stack
- **Severidade:** P1
- **Status:** Aberto
- **Local:** next.config.ts:49-106 (nextConfig sem `output`) · raiz do repo (ausência de Dockerfile/.dockerignore/docker-compose/docker-stack/.nvmrc — confirmado por `find` + `git ls-files`)
- **Evidência:** `grep -n "output\|standalone" next.config.ts` → nenhum resultado (config tem
  `serverExternalPackages`, `images`, `headers` — nada de `output`). `find` e `git ls-files` por
  `Dockerfile*`/`docker-compose*`/`docker-stack*`/`compose.y*ml`/`.nvmrc`/`.dockerignore` → **vazio**.
  Sem `output:'standalone'`, o `next build` não emite `.next/standalone/server.js` que o container
  precisa para rodar sem `node_modules` completo.
- **Impacto:** Impossível containerizar o Next para Swarm/Compose sem isto. Sem Dockerfile multi-stage +
  `.dockerignore`, a imagem fica gigante e arrisca embutir `.env`/segredo em layer (referência §4 = P1).
- **Correção:** (a) `output: "standalone"` no nextConfig (next.config.ts:49). (b) Dockerfile multi-stage
  (deps → build → runner), `USER node` (não-root), copiar `.next/standalone` + `.next/static` + `public`,
  `EXPOSE 3000`, `CMD ["node","server.js"]`. (c) `.dockerignore` (node_modules, .next, .git, .env*,
  auditoria/, AUDITORIA/, audit/, docs/, .mcp.json, .vercel, .env.vercel.*). (d) Base do Node pinada
  (OPS-010). (e) Healthcheck → `/api/health` (já existe, profundo DB+Redis, runtime nodejs,
  maxDuration=10 — health/route.ts:7-9).
- **Verificação:** após `output:'standalone'`, `next build` gera `.next/standalone/server.js`;
  `docker build` produz imagem que sobe e responde `/api/health` 200; `docker history` sem segredo.

### [OPS-003] ⚠️MIGRAÇÃO — Redis via `@upstash/redis` (REST) não fala TCP; trocar por `ioredis`/`redis` ou SRH
- **Severidade:** P1
- **Status:** Aberto
- **Local:** src/lib/redis.ts:1,21 · src/lib/ratelimit.ts:1-2 · src/lib/redis/cache.ts:9-10 · src/proxy.ts:142-155,169-176 (fetch REST direto) · package.json:29-30 (`@upstash/ratelimit`, `@upstash/redis`)
- **Evidência:** `grep -rn "@upstash/" src` → 3 usos vivos: `redis.ts` (`new Redis({url,token})`),
  `ratelimit.ts` (`Redis` + `Ratelimit`) e `redis/cache.ts`. Além disso o proxy NÃO usa o SDK: faz
  `fetch` HTTP direto contra a REST API do Upstash em proxy.ts:152 (`/get/tenant:slug:...`) e proxy.ts:174
  (`/get/tenant:redirect:...`). O cliente REST do Upstash **não** conversa com Redis TCP self-hosted.
- **Impacto:** No Swarm/Compose com Redis TCP, cache de tenant (proxy), rate-limit (ratelimit.ts) e os
  redirects de slug param de funcionar. Buckets fail-closed em prod derrubam requests com política de
  negação quando o Redis "presente mas incompatível" responde.
- **Correção:** Trocar `@upstash/redis`/`@upstash/ratelimit` por `ioredis` — OU rodar um SRH
  (Serverless-Redis-HTTP, preserva a interface REST). Pontos: (1) `redis.ts` → `new Redis(REDIS_URL)`
  com guarda de URL ausente; (2) `ratelimit.ts` — `@upstash/ratelimit` não aceita client `ioredis`;
  migrar para `rate-limiter-flexible` ou sliding-window em Lua, mantendo o tratamento de falha de comando
  e os buckets `RATE_LIMITS`; (3) `redis/cache.ts` idem; (4) `proxy.ts` — substituir os dois `fetch` REST
  por client TCP OU manter só o fallback `/api/internal/resolve-tenant` removendo o caminho Redis-REST
  (ver OPS-004); (5) CSP `connect-src` (next.config.ts:35 libera `*.upstash.io`) e `.env.example` p/ o
  endpoint TCP.
- **Verificação:** `grep -rn "@upstash/" src` → vazio; cache de tenant e rate-limit testados contra Redis
  TCP local (`redis-cli ping` + hit no proxy + 429 controlado).

### [OPS-004] ⚠️MIGRAÇÃO — `proxy.ts` assume premissas de Edge-runtime; revalidar para Node no self-host
- **Severidade:** P1
- **Status:** Aberto
- **Local:** src/proxy.ts (fetch REST :152,174; hop interno :210-211) · src/lib/redis.ts:9 (comentário "esse módulo roda no middleware") · src/instrumentation.ts (`NEXT_RUNTIME !== "nodejs"` guard)
- **Evidência:** O middleware do Next roda no Edge na Vercel — por isso o proxy usa `fetch` REST ao
  Upstash (proxy.ts:152,174) e resolve tenant via hop HTTP a `/api/internal/resolve-tenant`
  (proxy.ts:210-211), evitando Prisma (CLAUDE.md: "Proxy roda no Edge Runtime — NÃO pode usar Prisma
  direto"). Em Docker não há Edge: o middleware roda em Node no `server.js`. O código é Node-compatível
  (sem `request.geo`/`request.ip`), mas as **premissas** (sem Prisma, Redis só via REST) deixam de fazer
  sentido e carregam a dívida do OPS-003 sem necessidade.
- **Impacto:** Funcionalmente o middleware segue rodando em Node, mas mantém dependência REST do Upstash e
  o hop HTTP interno extra por request. Sem revisão, herda a incompatibilidade Redis-TCP para o self-host.
- **Correção:** Na migração, decidir e documentar: (a) middleware Node resolvendo tenant via Prisma direto
  (elimina hop REST + Redis-REST), OU (b) manter o hop trocando Redis REST por TCP (OPS-003). Revalidar
  `instrumentation.ts` (`NEXT_RUNTIME` continua "nodejs" no self-host — ok) e limpar os comentários
  "edge-only" obsoletos em redis.ts:9.
- **Verificação:** middleware resolve tenant em ambiente Node self-host (subdomínio + custom domain) sem
  depender de Upstash REST; `grep "edge" src/proxy.ts src/lib/redis.ts` revisado.

### [OPS-005] ⚠️MIGRAÇÃO — Storage acoplado à Supabase Storage REST; migrar para MinIO/R2 (S3)
- **Severidade:** P1
- **Status:** Aberto
- **Local:** src/lib/supabase/storage.ts (bucket `vitrine-assets`) · src/lib/certificates/storage.ts (bucket `certificates`, signed URLs) · src/lib/storage/payout-proof.ts:11,39,60,74 (bucket privado, `SUPABASE_SERVICE_ROLE_KEY`) · src/lib/packages/cover-upload.ts
- **Evidência:** Toda I/O de arquivos usa a REST API do Supabase Storage com `SUPABASE_SERVICE_ROLE_KEY`
  e paths hardcoded `${url}/storage/v1/object/{public|sign}/${BUCKET}/...`. **Terceiro módulo confirmado
  nesta rodada:** `payout-proof.ts:39,60,74` (`/storage/v1/object/${BUCKET}/...`, service-role key). URLs
  públicas de capas e certificados são persistidas no banco nesse formato. CSP libera `*.supabase.co`
  (next.config.ts:31,35) e `s3.bmbr.com.br` só em `img-src` (:31), NÃO em `connect-src` (:35).
- **Impacto:** Em MinIO/R2 os endpoints/headers (S3 SigV4) e o formato de URL pública mudam. As URLs já
  persistidas (capas de curso/pacote, PDFs de certificado, comprovantes de payout) deixam de resolver
  após o cutover se host/path mudarem — quebra imagens, download de certificado e comprovante.
- **Correção:** (a) Trocar os clients por SDK S3 (`@aws-sdk/client-s3`) apontando para MinIO/R2; recriar
  buckets `vitrine-assets` (público), `certificates` e o de payout (privados + presigned). (b) Migrar os
  objetos e **reescrever as URLs persistidas** (`Course.coverImageUrl`, capas de `CoursePackage`,
  `Certificate.pdfUrl`/path, comprovantes de payout, logos de tenant/grupo). (c) Ajustar CSP
  `img-src`/`connect-src` (next.config.ts:31,35) para o host do storage (`s3.bmbr.com.br` falta em
  `connect-src`). (d) Ajustar `extractAssetPath`/`extractCertificatePath` aos novos markers.
- **Verificação:** upload de capa, emissão/validação de certificado e upload/download de comprovante
  funcionam contra MinIO/R2; nenhuma 404 em `Course.coverImageUrl`/`Certificate.pdfUrl` pós-reescrita.

### [OPS-006] ⚠️MIGRAÇÃO — Dependências e API Vercel-específicas (`@vercel/analytics`/`speed-insights` + domínios custom)
- **Severidade:** P2
- **Status:** Aberto
- **Local:** src/components/shared/analytics-gate.tsx:3-4 · package.json:31-32 · src/lib/vercel/client.ts:1-133 (Vercel Project Domains API + `getDomainConfig` v6) · src/lib/tenant/urls.ts:83 (`vercelApexIp()` default `216.198.79.1`) · /api/painel/dominio (consumidor)
- **Evidência:** `grep -rn "@vercel/" src` → `Analytics` + `SpeedInsights` em analytics-gate.tsx (no-op
  fora da Vercel — peso morto). `vercel/client.ts` faz TODA a anexação de domínio custom via Vercel
  Project Domains API (`add`/`verify`/`remove`/`getDomainConfig`). **Aprofundado no delta:** o commit
  `a42ccb8` (2026-07-02) adicionou `getDomainConfig` (v6 `config/misconfigured`) e passou a gatear a
  aplicação do domínio pela verificação da Vercel — mais lógica presa à Vercel. `urls.ts:83` devolve o
  IP de apex da Vercel. CSP referencia `va.vercel-scripts.com`/`vitals.vercel-insights.com`
  (next.config.ts:34-35).
- **Impacto:** Fora da Vercel: (1) Analytics/SpeedInsights não coletam (perde observabilidade "de graça").
  (2) **CRÍTICO p/ negócio:** o fluxo de domínio próprio de revenda (anexar apex+www, verificar DNS,
  emitir SSL) some — em Traefik/Cloudflare vira gestão dinâmica de router + Let's Encrypt (ou Cloudflare
  for SaaS / custom hostnames) por domínio, a reimplementar. Sem isso, revendas com domínio próprio ficam
  sem HTTPS/roteamento.
- **Correção:** (a) Remover `@vercel/analytics` + `@vercel/speed-insights` + `AnalyticsGate` (ou trocar por
  self-hosted) e limpar CSP (next.config.ts:34-35). (b) Reimplementar `vercel/client.ts` como provider de
  domínios do alvo escolhido: Traefik (router + certresolver Let's Encrypt dinâmico) OU Cloudflare for SaaS
  (custom hostnames API) — coerente com a decisão "VPS + Cloudflare" da memória. Ajustar
  `urls.ts:cnameTarget()` e `vercelApexIp()`. (c) Wildcard `*.livrecursos.com.br`: cert wildcard via
  DNS-01 (Traefik) ou Cloudflare proxied.
- **Verificação:** `grep -rn "@vercel/" src` → vazio; anexar domínio custom de teste gera roteamento +
  cert válido; `*.livrecursos.com.br` resolve com cert wildcard.

### [OPS-007] ⚠️MIGRAÇÃO — Sem Docker Swarm/Compose secrets; app lê segredos de alto poder de env
- **Severidade:** P2
- **Status:** Aberto
- **Local:** scripts/apply-pending-migrations.mjs:54 · src/lib/supabase/storage.ts:5 + certificates/storage.ts:5 + storage/payout-proof.ts:11 (`SUPABASE_SERVICE_ROLE_KEY`) · src/lib/env.ts (ENCRYPTION_KEY/CRON_SECRET/INTERNAL_SECRET) · .env.example
- **Evidência:** A app depende de segredos de alto poder em env: `SUPABASE_SERVICE_ROLE_KEY` (poder total
  no storage/DB), `ENCRYPTION_KEY`, `CRON_SECRET`, `INTERNAL_SECRET`, `ASAAS_API_KEY`, `MP_WEBHOOK_SECRET`,
  `PMB_WEBHOOK_SECRET`, `LMS_API_KEY`, `VAPID_PRIVATE_KEY`, `SMTP_PASSWORD`. Hoje injetados como env na
  Vercel. Não há mecanismo de secrets de orquestrador no repo (sem compose/stack — OPS-002).
- **Impacto:** Na VPS, sem secrets do orquestrador esses valores cairiam num `.env` no host ou em layer de
  imagem (referência §4 = P1). `SUPABASE_SERVICE_ROLE_KEY` vazado = controle total do storage.
- **Correção:** Definir `secrets:` no compose/stack e ler via `/run/secrets/*`. Atualizar `src/lib/env.ts`
  para aceitar variantes `*_FILE` (ler conteúdo do arquivo quando a env aponta para um path), começando
  pelos de maior poder (SERVICE_ROLE_KEY, ENCRYPTION_KEY, DATABASE_URL/DIRECT_URL, ASAAS_API_KEY,
  LMS_API_KEY, PMB_WEBHOOK_SECRET). NUNCA commitar o stack com valores.
- **Verificação:** stack sobe lendo de `/run/secrets`; nenhum segredo em `docker history` nem no `.env` do
  host.

### [OPS-008] ⚠️MIGRAÇÃO — Pooling Supavisor → pgBouncer; backups não testados
- **Severidade:** P2
- **Status:** Aberto
- **Local:** src/lib/prisma.ts:15-20 (Pool `pg` sobre `DATABASE_URL`, `max` = `DATABASE_POOL_MAX ?? 10`) · scripts/apply-pending-migrations.mjs:54 (migrations via `DIRECT_URL`) · .env.example
- **Evidência:** Runtime usa `DATABASE_URL` (pooled Supavisor) com `Pool` do `pg` (prisma.ts:15-20,
  `max` default 10, `idleTimeout` 30s, `connectionTimeout` 5s); migrations usam a conexão DIRETA
  `DIRECT_URL` de propósito (mjs:49-54). Não há backup/restore documentado no repo (Supabase Cloud
  gerencia backup hoje, conforme memória).
- **Impacto:** Self-hostando Postgres, o Supavisor some: é preciso pgBouncer em transaction-mode; o teto de
  60 conexões citado em prisma.ts:10-13 muda. Sem backup testado (pg_dump/pg_basebackup + WAL/PITR +
  restore validado), perda de dados não tem recuperação (referência §4 = P1; aqui P2 por ser planejamento).
- **Correção:** (a) Provisionar pgBouncer (transaction pooling); `DATABASE_URL` → pgBouncer, `DIRECT_URL`
  direto ao Postgres para migrations. (b) Revisar `max` do Pool (prisma.ts:17) em função do pgBouncer.
  (c) Definir e **testar** backup: `pg_dump`/`pg_basebackup` + WAL archiving + restore num host limpo,
  agendado e monitorado. (d) Sem RLS no banco (isolamento em código), recriar só extensões usadas
  (`pg_cron`, `pg_net`) e roles — não há policies para portar.
- **Verificação:** app sobe contra pgBouncer sem esgotar conexões sob carga; restore de backup recente
  reconstrói o banco num host limpo (drill documentado).

### [OPS-009] ⚠️MIGRAÇÃO — Crons via Supabase pg_cron (`pg_net`→endpoint HTTP); precisam de scheduler próprio na VPS
- **Severidade:** P2
- **Status:** Aberto
- **Local:** prisma/sql/pg_cron_jobs.sql:1-85 (13 jobs via `app_internal.run_cron` → `net.http_post`) · src/app/api/cron/** (17 handlers) · vercel.json:2 (`"crons": []`)
- **Evidência:** O scheduler canônico é o Supabase pg_cron disparando `app_internal.run_cron(path)` que faz
  `net.http_post` (pg_net) para `/api/cron/*` com `Authorization: Bearer CRON_SECRET`
  (pg_cron_jobs.sql:15-17). `vercel.json` = `{"crons":[]}` (plano Hobby). `pg_cron`/`pg_net` são extensões
  do Supabase. **Contagem atual:** 17 handlers em disco, **13 agendados** (sync-cursos, sync-progresso,
  sweep-tenants-overdue, sweep-students-overdue, reactivate-paid, referral-monthly-payout,
  cleanup-webhook-logs, sweep-abandoned-leads, sweep-students-expired, sweep-visitor-events,
  sync-cursos-lms, sync-day-update-lms, reconcile-tenant-payments). Os 4 restantes são on-demand por design
  e N/A para agendamento: `fix-gateway-collapse` (remediação one-shot), `resync-lms-credentials` (reparo),
  `resync-platform-passwords` (memória: "sem cron por escolha do dono"), `sync-lms-branding` (backfill).
- **Impacto:** Postgres self-hosted comum não tem `pg_cron`/`pg_net` por padrão. Sem eles, **nenhum cron
  periódico roda** (sync catálogo EA/LMS, bloqueio de inadimplentes, payout de comissões, reconciliação de
  mensalidades, day-update LMS) — impacto operacional severo e silencioso.
- **Correção:** Escolher scheduler na VPS: (a) instalar `pg_cron`+`pg_net` no Postgres self-hosted e
  recriar `app_internal.run_cron` + os 13 jobs; OU (b) trocar por cron de sistema/container (serviço no
  orquestrador com `curl` autenticado, ofelia, ou GitHub Actions schedule) chamando `/api/cron/*` com o
  `CRON_SECRET`. Documentar no ADR-002. Manter `pg_cron_jobs.sql` versionado.
- **Verificação:** os 13 handlers periódicos têm agendador ativo na VPS; execução de teste de cada retorna
  200 e loga o evento.

### [OPS-010] Versão do Node não pinada (sem `engines`/`packageManager`/`.nvmrc`); CI fixa em 20, prod/imagem indefinidos
- **Severidade:** P2
- **Status:** Aberto
- **Local:** package.json (sem `engines`/`packageManager` — `grep` confirma) · ausência de `.nvmrc` (confirmado por `find`) · .github/workflows/ci.yml:25 (`node-version: 20`)
- **Evidência:** `grep "engines\|packageManager" package.json` → nada; `.nvmrc` inexistente. CI roda em
  Node 20 (ci.yml:25), mas nada garante paridade com o runtime da Vercel nem com a imagem base do futuro
  Dockerfile. Next 16 + Prisma 7 + React 19.2 são sensíveis à major do Node.
- **Impacto:** Risco "passa no CI, quebra em prod" por divergência de major do Node; na VPS a imagem fica
  sem fonte de verdade de versão (paridade dev/staging/prod — referência §3).
- **Correção:** Adicionar `"engines": { "node": ">=20 <21" }` (ou a versão exata) em package.json e criar
  `.nvmrc` com a mesma versão; usar essa versão como base da imagem Docker (OPS-002) e no
  `actions/setup-node` (ci.yml:24-25).
- **Verificação:** `node -v` em CI, Dockerfile e `.nvmrc` coincidem.

### [OPS-011] Sem ambiente de staging/homologação e sem plano de cutover (ADR-002 ausente)
- **Severidade:** P3
- **Status:** Aberto
- **Local:** vercel.json (só `crons:[]`) · .github/workflows/ci.yml (sem deploy de staging) · docs/architecture/ (só `ADR-001-arquitetura-multiproduto.md`; sem ADR-002 — confirmado por `ls`)
- **Evidência:** `ls docs/architecture/` mostra apenas `ADR-001`; **não existe ADR-002**. Não há referência
  a homologação fiel em vercel.json/ci.yml/next.config.ts; não existe Dockerfile/compose/stack (OPS-002)
  nem doc de cutover. A memória do projeto registra a decisão "VPS + Cloudflare, cenário C, ADR-002 a
  escrever" — ainda não materializada no repo.
- **Impacto:** A referência §3/§4 exige "staging fiel" para ensaiar a migração antes da prod. Sem ele e sem
  plano de cutover documentado, o cutover Vercel→VPS seria testado direto em produção — risco alto com
  Redis TCP, MinIO/R2, pgBouncer, Traefik/Cloudflare e scheduler novo em jogo.
- **Correção:** (a) Escrever ADR-002 (infra VPS + Cloudflare) com plano de cutover: DNS/TTL, janela, ordem
  de migração de dados (DB, storage), rollback, verificação pós-migração (rodar `/auditoria` + Portão
  Zero-Erro na VPS). (b) Provisionar stack de staging (mesma versão de Node/Postgres/Redis/MinIO, dados
  realistas anonimizados) e ensaiar o cutover lá.
- **Verificação:** ADR-002 existe com checklist de cutover; stack de staging responde `/api/health` 200 com
  todas as integrações; o ensaio foi executado e registrado.

### [OPS-012] Drift `.env.example` ↔ `env.ts` (`PMB_WEBHOOK_SECRET` + envs de runtime)
- **Severidade:** P3
- **Status:** Corrigido
- **Local:** .env.example:68 (`PMB_WEBHOOK_SECRET`), :81 (`MP_WEBHOOK_DEV_BYPASS`), :93 (`PMB_SUPPORT_EMAIL`), :101 (`VERCEL_APEX_IP`), :120-121 (`WA_GATEWAY_*`) · src/lib/env.ts:93 · commit `d44c865`
- **Evidência:** Re-verificado nesta rodada: o drift foi fechado pelo commit `d44c865` ("chore(devops):
  documentar PMB_WEBHOOK_SECRET + envs de runtime no .env.example — SEG-008/OPS-012"). `grep -c
  "PMB_WEBHOOK_SECRET" .env.example` → 1 (linha 68); as demais envs de runtime agora constam do exemplo.
  `env.ts:93` declara `PMB_WEBHOOK_SECRET` (`.min(16).optional()`).
- **Impacto:** Fechado. Onboarding de dev volta a ser reproduzível para a feature de webhook LMS.
- **Correção:** Já aplicada (commit `d44c865`).
- **Verificação:** `grep -c "PMB_WEBHOOK_SECRET" .env.example` → 1. **OK.**
- **Residual (fora do escopo DevOps — domínio `codigo`):** persiste leitura direta de `process.env` em
  ~40 pontos do `src/` (ex.: `wa-client.ts:23-24`, `urls.ts:83`, `mercadopago/process.ts:295`,
  `support/student-support.ts:14`, `storage/payout-proof.ts:11`), fora do schema `env.ts`, contrariando o
  guardrail "sempre via env.ts". Não é fail-fast nem tipado, mas não é achado DevOps — encaminhar ao
  domínio `codigo` para consolidar no `envSchema`.

### [OPS-013] Crons dependem de pg_cron aplicado À MÃO — sem prova de que estão ativos em produção
- **Severidade:** P1
- **Status:** Aberto (verificação manual)
- **Local:** prisma/sql/pg_cron_jobs.sql:11-21 (cabeçalho: "NÃO é rodado automaticamente pelo deploy — execução manual") · vercel.json:2 (`"crons": []`) · src/app/api/cron/** (13 handlers periódicos)
- **Evidência:** O único agendador dos 13 jobs periódicos é o Supabase pg_cron, e o próprio arquivo declara
  que **NÃO é aplicado pelo deploy** — precisa ser colado no SQL Editor manualmente (pg_cron_jobs.sql:11).
  Nada no pipeline (ci.yml, package.json, scripts/) aplica esse SQL. O repo, portanto, **não prova** que
  os jobs estão `active` no banco de produção. A memória do projeto registra dois incidentes reais desse
  acoplamento frágil: (1) "TODOS os jobs falharam de 30/04 a 10/06" (pg_net mudou de schema); (2) os 2
  jobs LMS + `reconcile-tenant-payments` foram adicionados ao arquivo mas exigem aplicação manual pós-deploy.
- **Impacto:** Se um job não estiver agendado/ativo em prod (por não ter sido colado, por schedule
  desligado, ou por nova quebra de `pg_net`), funções críticas param **silenciosamente**: suspensão de
  inadimplentes (`sweep-tenants-overdue`), bloqueio de alunos (`sweep-students-overdue`), reativação de
  quem pagou (`reactivate-paid`), payout de comissões (`referral-monthly-payout`), reconciliação de
  mensalidades (`reconcile-tenant-payments`), sync de catálogo e day-update LMS. Impacto de billing/matrícula
  sem alerta.
- **Correção (ação do dono — não editável pelo repo):**
  1. No Supabase SQL Editor rodar `select jobname, schedule, active, database from cron.job order by
     jobname;` e confirmar que os **13** jobs de `pg_cron_jobs.sql` estão presentes e `active = true`.
  2. Conferir execuções recentes: `select jobid, status, return_message, start_time from
     cron.job_run_details order by start_time desc limit 50;` — nenhuma falha recorrente (ex.: `net`
     schema/permissão).
  3. Confirmar que `app_internal.run_cron` existe e usa o schema `net` atual (não o legado) e o
     `CRON_SECRET` vigente.
  4. Estrutural: mover a aplicação de `pg_cron_jobs.sql` para um passo idempotente de deploy (ou incluir
     como migration idempotente rastreada em `_pmb_applied_migrations`), eliminando o passo manual; e
     adicionar alerta/heartbeat que detecte cron parado (ex.: `cleanup-webhook-logs`/`reconcile` sem
     execução no período esperado → notifica SUPER_ADMIN).
  5. Alternativa de robustez p/ a VPS: adotar scheduler externo (GitHub Actions schedule ou serviço cron no
     orquestrador) chamando `/api/cron/*` com `CRON_SECRET`, desacoplando de `pg_cron`/`pg_net` (converge
     com OPS-009).
- **Verificação:** `cron.job` lista os 13 jobs `active=true`; `cron.job_run_details` sem falhas recentes;
  uma execução de teste de cada handler retorna 200.

## Cobertura
_Itens do inventário/área DevOps relevantes a este domínio e veredito de cada um (23 itens)._

| Item | Veredito |
|---|---|
| `package.json` (scripts build/typecheck/lint/test/db:*) | Achado **OPS-001** (build aplica migration :7), **OPS-010** (sem `engines`) |
| `next.config.ts` (headers segurança, images, CSP) | OK (HSTS/XCTO/XFO/Referrer/Permissions/CSP presentes; `unoptimized:true` por cota Vercel — contexto OPS-006); Achado **OPS-002** (sem `output:'standalone'`); nota: `s3.bmbr.com.br` em `img-src`:31 mas não em `connect-src`:35 (OPS-005) |
| `vercel.json` | OK (`crons:[]` intencional, scheduler é pg_cron); contexto OPS-009/OPS-013 |
| `.env.example` | **OPS-012 CORRIGIDO** (PMB_WEBHOOK_SECRET + envs de runtime documentados, commit d44c865); sem valores reais; alerta correto sobre service_role/ACCESS_TOKEN |
| `src/lib/env.ts` (validação Zod fail-fast) | OK (schema com requiredInProd, assertEnv); contexto OPS-007 (`*_FILE` p/ secrets), residual OPS-012 (envs lidas fora do schema) |
| `scripts/apply-pending-migrations.mjs` | Achado **OPS-001** (acoplamento build↔schema; DIRECT_URL :54); bootstrap-em-DB-novo OK (coreSchemaExists :111-119) |
| `prisma/sql/pg_cron_jobs.sql` | Achado **OPS-009** (⚠️MIGRAÇÃO pg_cron/pg_net) + **OPS-013** (aplicação manual, sem prova em prod); 13 jobs versionados |
| `prisma.config.ts` | OK (schema/migrations/datasource via DIRECT_URL) |
| `src/lib/prisma.ts` (Pool pg) | Achado **OPS-008** (⚠️MIGRAÇÃO Supavisor→pgBouncer; Pool :15-20) |
| `eslint.config.mjs` / `tsconfig.json` | OK (strict, noEmit, paths; lint no CI) |
| `.github/workflows/ci.yml` | OK (Lint+Typecheck+Test+**Build** no gate; `cancel-in-progress` :12; SKIP_PENDING_MIGRATIONS :33,51 não toca banco; `npm audit` informativo :59); Achado **OPS-010** (node 20 hardcoded :25), **OPS-011** (sem staging) |
| Dockerfile / .dockerignore / compose / stack / .nvmrc | Achado **OPS-002** + **OPS-010** (ausentes — ⚠️MIGRAÇÃO; confirmado por `find`+`git ls-files`) |
| `src/proxy.ts` (middleware multi-tenant) | Achado **OPS-004** (⚠️MIGRAÇÃO premissas Edge), **OPS-003** (Redis REST direto :152,174) |
| `src/lib/redis.ts` + `src/lib/ratelimit.ts` + `src/lib/redis/cache.ts` (@upstash) | Achado **OPS-003** (⚠️MIGRAÇÃO REST→TCP; 3 usos vivos); ratelimit com fallback de falha de comando OK |
| `src/lib/supabase/storage.ts` + `certificates/storage.ts` + `storage/payout-proof.ts` + `packages/cover-upload.ts` | Achado **OPS-005** (⚠️MIGRAÇÃO →MinIO/R2; 3º módulo payout-proof confirmado) |
| `src/lib/vercel/client.ts` + `analytics-gate.tsx` + `urls.ts (vercelApexIp)` | Achado **OPS-006** (⚠️MIGRAÇÃO domínios/SSL + analytics; aprofundado por commit a42ccb8) |
| `src/app/api/health/route.ts` + `src/instrumentation.ts` | OK (health nodejs, force-dynamic, maxDuration=10 — usável como healthcheck de container) |
| `src/lib/auth/bearer.ts` (cron/internal auth) | OK (secret p/ CRON_SECRET/INTERNAL_SECRET) — detalhe no domínio seguranca/api |
| Crons (17 handlers) — agendamento | 13 agendados; 4 on-demand por design (fix-gateway-collapse, resync-lms-credentials, resync-platform-passwords, sync-lms-branding) — N/A agendamento; prova em prod pendente (OPS-013) |
| Webhooks (asaas/mercadopago/lms) — runtime/maxDuration | OK (runtime/maxDuration declarados; HMAC/idempotência no domínio api) |
| 81 migrations — idempotência p/ DB novo na VPS | OK no fluxo atual (DB existente bootstrapa; DB vazio aplica em ordem); nota: migrations antigas (init/notifications/push) têm `CREATE TABLE` sem `IF NOT EXISTS` — só relevante p/ re-run parcial em DB novo; `ALTER TYPE ADD VALUE` exige PG12+ (nota p/ ADR-002) |
| Segredos em arquivos rastreados | OK — `git ls-files` só lista `.env.example`/`.mcp.json.example` (sem valores); `.env.vercel.production`/`.env.local`/`.mcp.json` gitignored (.gitignore:14-23) |
| Paridade de ambientes / staging / ADR-002 | Achado **OPS-011** (sem staging fiel, sem ADR-002 — só ADR-001 existe) |
