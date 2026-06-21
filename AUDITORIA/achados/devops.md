# Auditoria — DevOps & Migração (Vercel → VPS)
_Data: 2026-06-20 · Referência: .claude/skills/auditoria-saas/references/08-devops-migracao.md · Itens do inventário cobertos: 18/18 (área DevOps)_

## Resumo
- Itens verificados: 18 · Achados: P0=1 P1=5 P2=4 P3=3 · Nota do domínio: 5/10
- O deploy atual (Vercel + push→main) é funcional e tem um CI razoável, mas **acopla a aplicação
  de schema do banco ao `next build`** (risco P0) e a prontidão para a migração VPS/Swarm é **baixa**:
  não há `output:'standalone'`, Dockerfile, `.dockerignore`, compose/stack, Traefik, healthcheck de
  container, nem cliente Redis TCP. Cada um vira achado ⚠️MIGRAÇÃO abaixo.

## Achados

### [OPS-001] `npm run build` aplica migrations na PROD durante o build (acoplamento perigoso + bootstrap apaga schema em DB novo)
- **Severidade:** P0
- **Status:** Aberto
- **Local:** package.json:7 (`"build": "npm run db:apply-pending && next build"`) · scripts/apply-pending-migrations.mjs:111-125 (bootstrap) · prisma.config.ts:10
- **Evidência:** O build de produção executa `node scripts/apply-pending-migrations.mjs` ANTES de
  `next build`, abrindo conexão direta ao Postgres (`DIRECT_URL ?? DATABASE_URL`, linha 54) e aplicando
  todo `prisma/migrations/*/migration.sql` ainda não rastreado em `_pmb_applied_migrations`. Dois
  problemas concretos:
  1. **Acoplamento build↔schema-prod:** qualquer `next build` apontando para a env de produção altera
     o schema do banco. Um build de homologação/preview com `DATABASE_URL` de prod, ou um rollback de
     deploy, dispara DDL em produção sem etapa de aprovação. Não há `prisma migrate deploy` (confirmado:
     `grep "migrate deploy"` só aparece como comentário em apply-pending-migrations.mjs:6).
  2. **Bootstrap destrói a primeira migração num banco novo (crítico p/ a migração VPS):** em
     `ensureTracking` (linha 95-109) se a tabela `_pmb_applied_migrations` está vazia, o script chama
     `bootstrap()` (linha 111) que marca **todas as 67 migrations como aplicadas SEM executá-las**,
     assumindo "o schema do prod já está sincronizado". Num **Postgres self-hosted novo** (cenário
     central da migração) a tabela nasce vazia → bootstrap marca tudo como aplicado → `next build`
     conclui contra um **banco sem nenhuma tabela**. A app sobe e quebra em runtime.
  - Agravante: a migração inicial NÃO é idempotente — `prisma/migrations/20260413_init/migration.sql`
    tem 12 `CREATE TABLE` e dezenas de `CREATE TYPE` sem `IF NOT EXISTS` (só 1 `IF NOT EXISTS`, para o
    schema). A "defesa por idempotência" descrita no cabeçalho do script (linha 22-24) não vale para as
    migrations antigas; logo, mesmo sem bootstrap, re-rodar a init num DB parcial quebraria.
- **Impacto:** Em prod hoje: qualquer build com env de prod muda o banco (mudança não-revisada, sem
  janela). Na ida p/ VPS: o primeiro deploy sobe a app com schema vazio (app fora do ar / perda de
  dados se rodar contra um dump parcial). Severidade P0.
- **Correção:**
  1. **Desacoplar migração do build.** Remover `db:apply-pending` do script `build` (package.json:7 →
     `"build": "next build"`). Mover a aplicação de schema para um passo de deploy explícito e separado
     (job dedicado no pipeline, ou comando manual `npm run db:migrate`), nunca dentro de `next build`.
  2. Adotar `prisma migrate deploy` como mecanismo canônico (executa migrations versionadas pelo Prisma,
     com tracking em `_prisma_migrations`, sem bootstrap silencioso). Se mantiver o runner caseiro,
     **remover a heurística de bootstrap** (apply-pending-migrations.mjs:111-125) e exigir uma flag
     explícita `PMB_BOOTSTRAP=1` para marcar migrations sem rodar (e logar alarme).
  3. Para a VPS: garantir que num DB novo as migrations rodem de fato (init não-idempotente exige rodar
     na ordem, contra DB vazio) — preferir `prisma migrate deploy`.
- **Verificação:** `grep -n "db:apply-pending" package.json` não deve aparecer no script `build`;
  rodar o pipeline de deploy contra um Postgres efêmero vazio e confirmar que as 67 migrations criam o
  schema completo (`\dt` lista todas as 43 tabelas dos models). Portão Zero-Erro: `SKIP_PENDING_MIGRATIONS=1 npm run build` continua verde.

### [OPS-002] ⚠️MIGRAÇÃO — `next.config.ts` sem `output: 'standalone'`; nenhum Dockerfile/.dockerignore/compose
- **Severidade:** P1
- **Status:** Aberto
- **Local:** next.config.ts:44-99 (config sem `output`) · raiz do repo (ausência de Dockerfile, .dockerignore, docker-compose.yml, docker-stack.yml)
- **Evidência:** `grep -n "output\|standalone" next.config.ts` → nenhum resultado. `ls Dockerfile
  .dockerignore docker-compose.yml docker-stack.yml compose.yaml` → nenhum arquivo existe. Sem
  `output:'standalone'`, o `next build` não emite o bundle autocontido `.next/standalone` que o
  container precisa rodar com `node server.js` sem `node_modules` completos.
- **Impacto:** Impossível containerizar o Next para o Swarm sem antes adicionar isto. Sem Dockerfile
  multi-stage + `.dockerignore`, a imagem fica gigante e arrisca embutir segredos/`.env` em layer (P1
  conforme referência §4).
- **Correção:** (a) Adicionar `output: "standalone"` ao `nextConfig` em next.config.ts. (b) Criar
  Dockerfile multi-stage (deps → build → runner), usuário não-root (`USER node`), copiar
  `.next/standalone`, `.next/static` e `public`, expor a porta e `CMD ["node","server.js"]`. (c) Criar
  `.dockerignore` (node_modules, .next, .git, .env*, auditoria/, audit/, docs/). (d) Pinar a versão do
  Node na imagem base (ver OPS-009).
- **Verificação:** após `output:'standalone'`, `next build` gera `.next/standalone/server.js`;
  `docker build` produz imagem que sobe e responde `/api/health` 200.

### [OPS-003] ⚠️MIGRAÇÃO — Redis via `@upstash/redis` (REST) não fala TCP; precisa trocar por `ioredis`/`redis` ou SRH
- **Severidade:** P1
- **Status:** Aberto
- **Local:** src/lib/redis.ts:1,21 · src/lib/ratelimit.ts:1-2,9 · src/proxy.ts:163,184 (chama REST direto via `fetch ${UPSTASH_REDIS_REST_URL}/get/...`) · package.json:29-30 (`@upstash/ratelimit`, `@upstash/redis`)
- **Evidência:** `grep -rn "@upstash/" src` → 3 imports: `redis.ts` (`new Redis({url,token})`),
  `ratelimit.ts` (`Redis` + `Ratelimit`). Além disso o proxy NÃO usa o SDK: faz `fetch` HTTP direto
  contra a REST API do Upstash em proxy.ts:163 e proxy.ts:184 (`${url}/get/tenant:${slug}`). O cliente
  REST do Upstash **não** conversa com um Redis TCP self-hosted.
- **Impacto:** No Swarm com Redis TCP self-hosted, cache de tenant (proxy), rate-limit e os redirects
  de slug param de funcionar. Como o rate-limit é fail-closed em prod para buckets públicos
  (ratelimit.ts:68), um Redis "presente mas incompatível" pode até negar tráfego.
- **Correção:** Trocar `@upstash/redis`/`@upstash/ratelimit` por cliente TCP (`ioredis`) — OU rodar um
  proxy SRH (Serverless-Redis-HTTP) que mantém a interface REST. Pontos a refatorar: (1) `redis.ts`
  `createRedisClient` → `new Redis(REDIS_URL)` ioredis; (2) `ratelimit.ts` → usar um limiter compatível
  (o `@upstash/ratelimit` aceita um client `ioredis`-like? não — migrar para implementação própria de
  sliding-window em Lua/Redis, ou usar `rate-limiter-flexible`); (3) `proxy.ts` resolve* — substituir os
  dois `fetch` REST por chamadas ao client TCP **OU** manter a chamada de fallback ao
  `/api/internal/resolve-tenant` (já existe) e remover o caminho Redis-REST do Edge (ver OPS-004).
- **Verificação:** `grep -rn "@upstash/" src` → vazio; cache de tenant e rate-limit testados contra um
  Redis TCP local (`redis-cli ping` + hit no proxy).

### [OPS-004] ⚠️MIGRAÇÃO — `proxy.ts` é Edge-runtime e o Swarm não tem Edge; reescrever para Node
- **Severidade:** P1
- **Status:** Aberto
- **Local:** src/proxy.ts (arquivo inteiro; matcher em :382-386) · src/lib/redis.ts:9-19 (comentário "esse módulo roda no middleware"/edge) · src/instrumentation.ts:11-13 (`if NEXT_RUNTIME !== "nodejs" return` — assume runtime Edge no middleware)
- **Evidência:** O proxy/middleware do Next roda no Edge Runtime na Vercel — por isso usa `fetch` REST
  ao Upstash (proxy.ts:163) e evita Prisma (comentário em CLAUDE.md "Proxy roda no Edge Runtime — NAO
  pode usar Prisma direto"). Em Docker Swarm não existe Edge Runtime: o middleware do Next roda em Node
  no `next start`/`server.js`. O código em si é compatível com Node, mas as **premissas** (sem Prisma,
  Redis só via REST, `NEXT_RUNTIME` checagens) precisam ser revalidadas.
- **Impacto:** Funcionalmente o middleware continua rodando em Node no self-host (não quebra por si),
  mas perde-se a justificativa do REST-Redis (OPS-003) e abre-se a opção de resolver tenant via Prisma
  direto no middleware (mais simples). Sem revisão, mantém-se a dependência REST do Upstash sem
  necessidade. Itens que dependiam de comportamento Edge (`geo`, `ip` da Vercel) — não há uso de
  `request.geo`/`request.ip` no proxy (confirmado: `grep "request.ip\|\.geo"` não retorna no proxy), então
  esse risco é baixo.
- **Correção:** Na migração, decidir e documentar: (a) manter middleware Node e resolver tenant via
  Prisma direto (eliminando o hop REST→`/api/internal/resolve-tenant`), OU (b) manter o hop interno mas
  trocar o Redis REST por TCP (OPS-003). Revalidar `instrumentation.ts:11-13` (`NEXT_RUNTIME` continua
  setado para "nodejs" no self-host — ok) e remover comentários "edge-only" obsoletos em redis.ts.
- **Verificação:** middleware resolve tenant em ambiente Node self-host (subdomínio e custom domain) sem
  depender de Upstash REST; `grep "edge" src/proxy.ts src/lib/redis.ts` revisado.

### [OPS-005] ⚠️MIGRAÇÃO — Storage acoplado à Supabase Storage REST; migrar para MinIO (S3)
- **Severidade:** P1
- **Status:** Aberto
- **Local:** src/lib/supabase/storage.ts:1-94 (bucket `vitrine-assets`, URLs `/storage/v1/object/...`) · src/lib/certificates/storage.ts:1-153 (bucket `certificates`, signed URLs `/storage/v1/object/sign/...`) · src/lib/packages/cover-upload.ts
- **Evidência:** Toda I/O de arquivos usa a API REST do Supabase Storage com `SUPABASE_SERVICE_ROLE_KEY`
  e paths hardcoded `${url}/storage/v1/object/{public|sign}/${BUCKET}/...` (storage.ts:47,68,75 e
  certificates/storage.ts:47,84,99,121,145). URLs públicas de capas/certificados são gravadas no banco
  com esse formato (CSP já libera `*.supabase.co` em next.config.ts:29).
- **Impacto:** Em MinIO os endpoints/headers (S3 SigV4) e o formato de URL pública mudam. As URLs já
  persistidas no banco (capas de curso/pacote, PDFs de certificado) deixam de resolver após o cutover
  se o domínio/path mudar — quebra imagens e download de certificado.
- **Correção:** (a) Trocar os clients por SDK S3 (`@aws-sdk/client-s3`) apontando para o endpoint MinIO;
  recriar buckets `vitrine-assets` (público) e `certificates` (privado + presigned). (b) Migrar os
  objetos existentes (Supabase → MinIO) e **reescrever as URLs persistidas** no banco
  (`Course.coverImageUrl`, `CoursePackage`/capas, `Certificate.pdfUrl`...). (c) Ajustar CSP
  `img-src`/`connect-src` em next.config.ts:29,33 para o host do MinIO. (d) Manter `createSignedUrl`
  via presigned S3 (certificates/storage.ts:94 já existe como abstração — substituir o corpo).
- **Verificação:** upload de capa e emissão de certificado funcionam contra MinIO; URLs antigas
  redirecionadas/reescritas (nenhuma 404 em `Course.coverImageUrl` após migração).

### [OPS-006] Cron `reconcile-tenant-payments` existe como handler mas NÃO está agendado no pg_cron
- **Severidade:** P1
- **Status:** Aberto
- **Local:** src/app/api/cron/reconcile-tenant-payments/route.ts:1-73 (handler completo, auth via `isCronAuthorized`) · prisma/sql/pg_cron_jobs.sql (12 jobs, sem este)
- **Evidência:** `comm -23` entre handlers em disco (13) e jobs no `pg_cron_jobs.sql` (12) →
  `/api/cron/reconcile-tenant-payments` é o único handler sem `cron.schedule` correspondente. O
  arquivo SQL afirma documentar "TODOS os jobs" (linha 8) mas este ficou de fora. O handler é completo
  e idempotente (route.ts:21-57) e descrito como "o varredor que limpa de uma vez o acúmulo de
  cobranças repetidas".
- **Impacto:** A reconciliação em massa de mensalidades (TenantPayment ↔ Asaas) nunca roda
  automaticamente. Cobranças órfãs (PENDING/OVERDUE/DELETING que não existem mais no Asaas) só são
  limpas ao abrir manualmente o detalhe de cada unidade → acúmulo de cobranças repetidas em prod
  (exatamente o problema que o cron foi escrito para resolver).
- **Correção:** Adicionar ao `prisma/sql/pg_cron_jobs.sql` um `cron.schedule('pmb-reconcile-tenant-
  payments', '<expr>', $$ select app_internal.run_cron('/api/cron/reconcile-tenant-payments') $$)` —
  sugestão: semanal (ex.: `0 4 * * 1`, segunda 04:00 UTC), dado `maxDuration=300` e a varredura
  sequencial. **Ação manual de deploy:** rodar o SQL no Supabase (o arquivo não é aplicado pelo deploy,
  conforme cabeçalho linha 11). Registrar como pendência de deploy no CLAUDE.md.
- **Verificação:** `select jobname from cron.job where jobname='pmb-reconcile-tenant-payments'` retorna
  1 linha; próxima execução loga `event: "cron.reconcile_tenant_payments"`.

### [OPS-007] ⚠️MIGRAÇÃO — Dependências Vercel-specific (`@vercel/analytics`, `@vercel/speed-insights`) e Vercel API para domínios custom
- **Severidade:** P2
- **Status:** Aberto
- **Local:** src/components/shared/analytics-gate.tsx:3-4 · package.json:31-32 · src/lib/vercel/client.ts:1-133 (gerencia domínios via `api.vercel.com`) · src/lib/tenant/urls.ts:74-76 (`VERCEL_APEX_IP`) · src/app/painel/dominio + api/painel/dominio (consumidores)
- **Evidência:** `grep -rn "@vercel/" src` → `Analytics` + `SpeedInsights` em analytics-gate.tsx (no-op
  fora da Vercel — não quebra, mas vira peso morto). `src/lib/vercel/client.ts` faz toda a anexação de
  domínio custom de revenda via Vercel Project Domains API (addProjectDomain/verify/remove) — esse é o
  mecanismo de **wildcard + custom domain + SSL automático** que a Vercel provê. CSP já referencia
  `va.vercel-scripts.com`/`vitals.vercel-insights.com` (next.config.ts:32-33).
- **Impacto:** Fora da Vercel: (1) Analytics/SpeedInsights não coletam nada (perde-se a observabilidade
  "de graça" — cobrir com self-hosted, ver domínio observabilidade). (2) **CRÍTICO p/ negócio:** todo o
  fluxo de domínio próprio de revenda (anexar apex+www, emitir SSL) some — em Traefik isso vira gestão
  dinâmica de roteamento + Let's Encrypt por domínio, que precisa ser reimplementado (criar/remover
  router/cert no Traefik via API/labels ou provider dinâmico). Sem isso, revendas com domínio próprio
  ficam sem HTTPS/roteamento.
- **Correção:** (a) Remover `@vercel/analytics` + `@vercel/speed-insights` e o `AnalyticsGate` (ou
  trocar por alternativa self-hosted) + limpar CSP. (b) Reimplementar `src/lib/vercel/client.ts` como
  um provider de domínios para Traefik: ao anexar custom domain, criar dinamicamente o router + cert
  resolver (Let's Encrypt) no Traefik; ao remover, limpar. Ajustar `urls.ts:cnameTarget()`/apex IP para
  o IP da VPS. (c) Wildcard `*.livrecursos.com.br`: cert wildcard via DNS-01 no Traefik.
- **Verificação:** `grep -rn "@vercel/" src` → vazio; anexar um domínio custom de teste resulta em
  router Traefik + cert válido; `*.livrecursos.com.br` resolve com cert wildcard.

### [OPS-008] ⚠️MIGRAÇÃO — Sem secrets via Docker Swarm; runner de migration e storage usam segredos de ambiente sensíveis
- **Severidade:** P2
- **Status:** Aberto
- **Local:** scripts/apply-pending-migrations.mjs:54 (`DIRECT_URL`/`DATABASE_URL`) · src/lib/supabase/storage.ts:5 (`SUPABASE_SERVICE_ROLE_KEY`) · src/lib/env.ts (esquema de envs) · .env.example:25-30 (alerta service_role)
- **Evidência:** A app depende de segredos de alto poder em env: `SUPABASE_SERVICE_ROLE_KEY` (poder
  total no storage/DB), `ENCRYPTION_KEY`, `CRON_SECRET`, `INTERNAL_SECRET`, `ASAAS_API_KEY`,
  `MP_WEBHOOK_SECRET`, `VAPID_PRIVATE_KEY`, credenciais SMTP. Hoje injetados como env na Vercel. Não há
  nenhum mecanismo de Swarm secrets no repo (sem compose/stack — ver OPS-002).
- **Impacto:** Na VPS, sem Swarm secrets esses valores tenderiam a cair num `.env` no host ou em layer
  de imagem (risco de vazamento). A referência §4 classifica segredo em layer/`.env` no repo como P1.
- **Correção:** Definir `secrets:` no `docker-stack.yml` (Swarm) e ler via arquivos montados em
  `/run/secrets/*` (padrão `*_FILE` ou leitura no boot). Atualizar `src/lib/env.ts` para aceitar
  `*_FILE` (ler conteúdo do arquivo quando a env aponta para um path), começando pelos de maior poder
  (SERVICE_ROLE_KEY, ENCRYPTION_KEY, DATABASE_URL, ASAAS_API_KEY). NUNCA commitar o stack com valores.
- **Verificação:** `docker stack` sobe lendo de `/run/secrets`; nenhum segredo em `docker image history`
  nem no `.env` do host.

### [OPS-009] Versão do Node não pinada (sem `engines`/`.nvmrc`); CI fixa em 20, prod indefinido
- **Severidade:** P2
- **Status:** Aberto
- **Local:** package.json (sem campo `engines`/`packageManager`) · ausência de `.nvmrc` · .github/workflows/ci.yml:25 (`node-version: 20`)
- **Evidência:** `grep "engines\|packageManager" package.json` → nada; `cat .nvmrc` → arquivo não
  existe. O CI roda em Node 20 (ci.yml:25), mas nada garante paridade com o runtime da Vercel nem com a
  imagem base do futuro Dockerfile. Next 16 + Prisma 7 + React 19 são sensíveis à major do Node.
- **Impacto:** Risco de "passa no CI, quebra em prod" por divergência de major do Node; na VPS, a imagem
  base do Docker fica sem fonte de verdade de versão (paridade dev/staging/prod — referência §3).
- **Correção:** Adicionar `"engines": { "node": ">=20 <21" }` (ou a versão exata usada) em package.json
  e criar `.nvmrc` com a mesma versão; usar essa versão como base da imagem Docker e no
  `actions/setup-node`.
- **Verificação:** `node -v` em CI, Dockerfile e `.nvmrc` coincidem.

### [OPS-010] ⚠️MIGRAÇÃO — Pooling Supavisor (Supabase) → pgBouncer; `prisma.ts` usa `DATABASE_URL` pooled e backups não testados
- **Severidade:** P2
- **Status:** Aberto
- **Local:** src/lib/prisma.ts:15-20 (Pool pg sobre `DATABASE_URL`, `max` configurável) · prisma.config.ts:10 + scripts/apply-pending-migrations.mjs:54 (migrations usam `DIRECT_URL` direto) · .env.example:16-19
- **Evidência:** Runtime usa `DATABASE_URL` (pooled via Supabase Supavisor) com `Pool` do `pg`
  (prisma.ts:15) e teto `DATABASE_POOL_MAX` (default 10); migrations usam a conexão DIRETA
  (`DIRECT_URL`) de propósito (apply-pending-migrations.mjs:49-54, comentário sobre transaction-mode do
  pooler). Não há backup/restore documentado no repo (memória do projeto indica Supabase Cloud gerencia
  backup hoje).
- **Impacto:** Self-hostando Postgres, o Supavisor some: é preciso pgBouncer (ou pooler equivalente) em
  transaction-mode, e o teto de 60 conexões/instância citado no comentário (prisma.ts:11) muda. Sem
  backup testado (pg_dump + WAL/PITR + restore validado), perda de dados não tem recuperação — P1 da
  referência §4, aqui tratado como P2 por ser planejamento.
- **Correção:** (a) Provisionar pgBouncer (transaction pooling) e apontar `DATABASE_URL` para ele,
  mantendo `DIRECT_URL` direto ao Postgres para migrations. (b) Revisar `max` do Pool em função do
  tamanho do pool do pgBouncer. (c) Definir e **testar** backup: `pg_dump`/`pg_basebackup` + WAL
  archiving + restore num ambiente limpo, agendado e monitorado. (d) Como não há RLS no banco
  (isolamento em código — ver domínio banco), recriar apenas extensões usadas (`pg_cron`, `pg_net`) e
  roles — não há policies para portar.
- **Verificação:** app sobe contra pgBouncer sem esgotar conexões sob carga; restore de backup recente
  reconstrói o banco num host limpo (drill documentado).

### [OPS-011] ⚠️MIGRAÇÃO — Crons via Supabase pg_cron (`pg_net` → endpoint HTTP); precisam de scheduler próprio na VPS
- **Severidade:** P2
- **Status:** Aberto
- **Local:** prisma/sql/pg_cron_jobs.sql:1-79 (12 jobs via `app_internal.run_cron` → `net.http_post`) · src/app/api/cron/** (13 handlers)
- **Evidência:** O scheduler canônico é o Supabase pg_cron disparando `app_internal.run_cron(path)` que
  faz `net.http_post` (pg_net) para `/api/cron/*` com `Authorization: Bearer CRON_SECRET`
  (pg_cron_jobs.sql:11-21). `vercel.json` tem `crons: []` (plano Hobby). Tanto `pg_cron` quanto `pg_net`
  são extensões do Supabase. Memória do projeto registra que TODOS os jobs já falharam (30/04–10/06)
  quando `pg_net` mudou de schema — sinal de fragilidade desse acoplamento.
- **Impacto:** Postgres self-hosted comum não tem `pg_cron`/`pg_net` por padrão. Se não forem
  instalados, **nenhum cron roda** (sync de catálogo, bloqueio de inadimplentes, payout de comissões,
  reconciliação...) — impacto operacional severo e silencioso.
- **Correção:** Escolher um scheduler na VPS: (a) instalar `pg_cron`+`pg_net` no Postgres self-hosted e
  recriar `app_internal.run_cron` + os 13 jobs (incluir o de OPS-006); OU (b) trocar por um cron de
  sistema/container (um serviço no Swarm com `curl` autenticado, ou GitHub Actions schedule, ou
  Traefik/ofelia) chamando `/api/cron/*` com o `CRON_SECRET`. Documentar no plano de cutover. Versionar
  o agendamento (já versionado em pg_cron_jobs.sql — manter atualizado).
- **Verificação:** todos os 13 handlers têm um agendador ativo na VPS; uma execução de teste de cada
  retorna 200 e loga o evento.

### [OPS-012] CI não roda `build`; bug de RSC/rota quebrada passa o gate
- **Severidade:** P3
- **Status:** Aberto
- **Local:** .github/workflows/ci.yml:36-50 (lint, typecheck, test, audit — sem `build`)
- **Evidência:** O job `validate` roda `npm run lint`, `npm run typecheck`, `npm test` e `npm audit`,
  mas NÃO roda `npm run build` (o que faz sentido para não tocar o banco — ver OPS-001). Como o Portão
  Zero-Erro exige `build` (pega rota/página quebrada e erro de RSC que tsc não pega), o gate de CI fica
  incompleto.
- **Impacto:** Um erro de build (Server Component inválido, import client/server trocado, rota que não
  compila) só é detectado no deploy da Vercel, não no PR.
- **Correção:** Após OPS-001 (desacoplar migração do build), adicionar passo
  `SKIP_PENDING_MIGRATIONS=1 npm run build` ao CI (ou `next build` direto). Sem tocar o banco. Isso
  completa o Portão Zero-Erro no CI conforme referência §2.
- **Verificação:** PR com erro de build vermelho no CI; PR limpo verde.

### [OPS-013] Sem ambiente de staging/homologação; migração não tem onde ser ensaiada
- **Severidade:** P3
- **Status:** Aberto
- **Local:** vercel.json:1-3 (só `crons`) · .github/workflows/ci.yml (sem deploy de staging) · ausência de menção a staging em configs
- **Evidência:** `grep -rn "staging\|homolog\|preview"` em vercel.json/next.config.ts/ci.yml → nenhuma
  referência a um ambiente de homologação fiel. A memória do projeto cita "homolog/prod na mesma VPS"
  como plano, mas não há infra de staging hoje.
- **Impacto:** Referência §3/§4 pede "staging fiel" para testar a migração antes da prod. Sem ele, o
  cutover Vercel→VPS é testado direto em produção — risco alto numa migração com tantas peças móveis
  (Redis TCP, MinIO, pgBouncer, Traefik).
- **Correção:** Provisionar um stack de staging na VPS (mesma versão de Node/Postgres/Redis/MinIO, dados
  realistas anonimizados) e rodar o Portão Zero-Erro + `/auditoria` lá antes do cutover de prod.
  Documentar o plano de cutover (DNS/TTL, janela, rollback, verificação pós-migração).
- **Verificação:** stack de staging responde `/api/health` 200 com todas as integrações; checklist de
  cutover existe e foi ensaiado.

## Cobertura
_Itens do inventário/área DevOps relevantes a este domínio e veredito de cada um._

| Item | Veredito |
|---|---|
| `package.json` (scripts build/typecheck/lint/test/db:*) | Achado OPS-001 (build aplica migration), OPS-009 (sem engines), OPS-012 (CI sem build) |
| `next.config.ts` (headers segurança, images, CSP) | OK (headers HSTS/XCTO/XFO/Referrer/Permissions/CSP presentes); Achado OPS-002 (sem `output:'standalone'`) |
| `vercel.json` | OK (`crons:[]` intencional, scheduler é pg_cron); contexto OPS-011 |
| `.env.example` | OK — nenhum valor real, só placeholders; alerta correto sobre service_role e SUPABASE_ACCESS_TOKEN; em sincronia com env.ts |
| `src/lib/env.ts` (validação Zod fail-fast) | OK (schema completo, requiredInProd, assertEnv); contexto OPS-008 (`*_FILE` p/ Swarm) |
| `scripts/apply-pending-migrations.mjs` | Achado OPS-001 (acoplamento + bootstrap em DB novo) |
| `prisma/sql/pg_cron_jobs.sql` | Achado OPS-006 (falta job reconcile-tenant-payments), OPS-011 (⚠️MIGRAÇÃO pg_cron/pg_net) |
| `prisma.config.ts` | OK (schema/migrations/datasource via DIRECT_URL) |
| `src/lib/prisma.ts` (Pool pg) | Achado OPS-010 (⚠️MIGRAÇÃO Supavisor→pgBouncer) |
| `eslint.config.mjs` | OK (next core-web-vitals + ts; `no-console` em lib/api server) |
| `tsconfig.json` | OK (strict, noEmit, paths) |
| `.github/workflows/ci.yml` | Achado OPS-012 (sem build no gate), OPS-013 (sem staging) |
| Dockerfile / .dockerignore / compose / stack | Achado OPS-002 (ausentes — ⚠️MIGRAÇÃO) |
| `src/proxy.ts` (Edge middleware multi-tenant) | Achado OPS-004 (⚠️MIGRAÇÃO Edge→Node), OPS-003 (Redis REST no Edge) |
| `src/lib/redis.ts` + `src/lib/ratelimit.ts` (@upstash) | Achado OPS-003 (⚠️MIGRAÇÃO REST→TCP) |
| `src/lib/supabase/storage.ts` + `src/lib/certificates/storage.ts` | Achado OPS-005 (⚠️MIGRAÇÃO →MinIO) |
| `src/lib/vercel/client.ts` + `components/shared/analytics-gate.tsx` | Achado OPS-007 (⚠️MIGRAÇÃO domínios/SSL + analytics) |
| `src/app/api/health/route.ts` + `instrumentation.ts` | OK (health profundo DB+Redis 503/200, runtime nodejs, force-dynamic); usável como healthcheck do container Traefik |
| `src/lib/auth/bearer.ts` (cron/internal auth) | OK (timing-safe, exige secret em prod) |
| 67 migrations idempotência | Contexto OPS-001 (init não-idempotente; relevante só p/ DB novo na VPS) |
| Segredos em arquivos rastreados | OK — só `.env.example` rastreado (`git ls-files`); `.env*`/`.mcp.json` no .gitignore; scan de tracked files sem segredos vivos |
