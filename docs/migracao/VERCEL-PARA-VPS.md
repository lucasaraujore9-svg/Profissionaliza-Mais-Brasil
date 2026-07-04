# Migração Vercel → VPS (Docker + Cloudflare)

> **Status: PLANEJAMENTO. Nada aqui foi aplicado ao runtime.** Este documento consolida, arquivo a
> arquivo, o que precisa mudar para tirar a aplicação da Vercel e rodá-la numa VPS própria
> (Docker Compose/Swarm + Cloudflare), sem quebrar a produção atual. Enquanto não houver ADR-002
> aprovado e um staging fiel, **nenhuma** destas mudanças deve entrar em `main`.
>
> Origem: auditoria DevOps `auditoria/achados/devops.md` (2026-07-03), achados **OPS-002 a OPS-009**
> e **OPS-011**. Cada seção referencia o achado e os arquivos/linhas exatos.

## Decisão de infra (memória do projeto, a formalizar em ADR-002)

- Sair da Vercel para **VPS própria** com **Docker** (Compose ou Swarm) atrás de **Cloudflare**.
- Postgres **self-hosted** (ou Supabase self-host) + **Redis TCP** self-hosted + storage **MinIO/R2 (S3)**.
- Deploy por **GitHub Actions via SSH** (cenário "C" da memória) — ainda **não** materializado no repo.
- **ADR-002 pendente** (`docs/architecture/` só tem ADR-001) — ver OPS-011.

---

## OPS-002 — Containerização (`output: 'standalone'` + Dockerfile + .dockerignore)

**Achado:** P1 · `next.config.ts` sem `output`; sem Dockerfile/.dockerignore/compose/stack/.nvmrc.

**O que muda:**

1. `next.config.ts` (bloco `nextConfig`, ~linha 49): adicionar `output: "standalone"` para o
   `next build` emitir `.next/standalone/server.js`. **Não aplicar na Vercel** — a Vercel não usa
   standalone e a mudança é inócua lá, mas só entra junto com o Dockerfile no cutover.
2. **Dockerfile multi-stage** na raiz (`deps → build → runner`):
   - base Node pinada = versão do `.nvmrc` (ver OPS-010);
   - `USER node` (não-root);
   - copiar `.next/standalone` + `.next/static` + `public`;
   - `EXPOSE 3000`; `CMD ["node","server.js"]`;
   - `HEALTHCHECK` → `GET /api/health` (já existe: runtime nodejs, checa DB+Redis, `maxDuration=10`).
3. **`.dockerignore`** na raiz: `node_modules`, `.next`, `.git`, `.env*`, `auditoria/`, `AUDITORIA/`,
   `audit/`, `docs/`, `.mcp.json`, `.vercel`, `.env.vercel.*` (evita segredo/peso em layer).

**Verificação:** `next build` gera `.next/standalone/server.js`; `docker build` sobe e responde
`/api/health` 200; `docker history` sem segredo.

---

## OPS-003 — Redis: `@upstash/redis` (REST) não fala TCP

**Achado:** P1 · `src/lib/redis.ts`, `src/lib/ratelimit.ts`, `src/lib/redis/cache.ts`,
`src/proxy.ts:152,174` (fetch REST direto), `package.json:29-30`.

**O que muda:** o cliente REST do Upstash **não** conversa com Redis TCP self-hosted. Trocar por
`ioredis`/`redis`, OU rodar um **SRH** (Serverless-Redis-HTTP) que preserva a interface REST.

- `src/lib/redis.ts` → `new Redis(REDIS_URL)` (ioredis) com guarda de URL ausente; limpar comentário
  "edge-only" em `redis.ts:9` (ver OPS-004).
- `src/lib/ratelimit.ts` → `@upstash/ratelimit` **não** aceita client `ioredis`. Migrar para
  `rate-limiter-flexible` (ou sliding-window em Lua), **mantendo** o tratamento de falha de comando
  (fail-open já implementado) e os buckets de `RATE_LIMITS`.
- `src/lib/redis/cache.ts` → idem client TCP.
- `src/proxy.ts` → substituir os dois `fetch` REST (`/get/tenant:slug:*` :152 e `/get/tenant:redirect:*`
  :174) por client TCP **ou** manter só o fallback `/api/internal/resolve-tenant` (ver OPS-004).
- CSP `connect-src` (`next.config.ts:35`, hoje libera `*.upstash.io`) e `.env.example` → endpoint TCP.

**Cuidado:** buckets **fail-closed** derrubam requests se o Redis estiver "presente mas incompatível".

**Verificação:** `grep -rn "@upstash/" src` → vazio; cache de tenant + rate-limit contra Redis TCP local
(`redis-cli ping`, hit no proxy, 429 controlado).

---

## OPS-004 — `proxy.ts` assume premissas de Edge-runtime

**Achado:** P1 · `src/proxy.ts` (fetch REST :152,174; hop interno :210-211), `src/lib/redis.ts:9`,
`src/instrumentation.ts`.

**O que muda:** na Vercel o middleware roda no **Edge** — por isso o proxy usa `fetch` REST ao Upstash e
resolve tenant via hop HTTP a `/api/internal/resolve-tenant` (evitando Prisma). Em Docker **não há Edge**:
o middleware roda em Node no `server.js`. O código já é Node-compatível (sem `request.geo`/`request.ip`),
mas as **premissas** deixam de valer.

Decidir e documentar na migração:
- **(a)** middleware Node resolvendo tenant via **Prisma direto** (elimina hop REST + Redis-REST), **ou**
- **(b)** manter o hop, trocando Redis REST por TCP (OPS-003).

Revalidar `instrumentation.ts` (`NEXT_RUNTIME` continua `"nodejs"` no self-host — ok) e limpar comentários
"edge-only" obsoletos em `redis.ts:9`.

**Verificação:** middleware resolve tenant em ambiente Node self-host (subdomínio + custom domain) sem
depender de Upstash REST.

---

## OPS-005 — Storage: Supabase Storage REST → MinIO/R2 (S3)

**Achado:** P1 · `src/lib/supabase/storage.ts` (bucket `vitrine-assets`),
`src/lib/certificates/storage.ts` (bucket `certificates`, signed URLs),
`src/lib/storage/payout-proof.ts:11,39,60,74` (bucket privado, `SUPABASE_SERVICE_ROLE_KEY`),
`src/lib/packages/cover-upload.ts`.

**O que muda:** toda I/O de arquivo usa a REST API do Supabase Storage com `SUPABASE_SERVICE_ROLE_KEY` e
paths hardcoded `${url}/storage/v1/object/{public|sign}/${BUCKET}/...`. URLs públicas de capas e
certificados são **persistidas no banco** nesse formato.

1. Trocar os clients por SDK S3 (`@aws-sdk/client-s3`) apontando para MinIO/R2; recriar buckets
   `vitrine-assets` (público), `certificates` e o de payout (privados + presigned).
2. **Migrar os objetos** e **reescrever as URLs persistidas**: `Course.coverImageUrl`, capas de
   `CoursePackage`, `Certificate.pdfUrl`/path, comprovantes de payout, logos de tenant/grupo.
3. CSP: `img-src`/`connect-src` (`next.config.ts:31,35`) para o host do storage — hoje `s3.bmbr.com.br`
   está em `img-src` (:31) mas **falta em `connect-src`** (:35).
4. Ajustar `extractAssetPath`/`extractCertificatePath` aos novos markers de path.

**Verificação:** upload de capa, emissão/validação de certificado e upload/download de comprovante contra
MinIO/R2; **nenhuma 404** em `Course.coverImageUrl`/`Certificate.pdfUrl` pós-reescrita.

---

## OPS-006 — Dependências e API Vercel-específicas (analytics + domínios custom)

**Achado:** P2 · `src/components/shared/analytics-gate.tsx:3-4`, `package.json:31-32`,
`src/lib/vercel/client.ts` (Vercel Project Domains API + `getDomainConfig` v6),
`src/lib/tenant/urls.ts:83` (`vercelApexIp()`), `/api/painel/dominio`.

**O que muda:**

1. `@vercel/analytics` + `@vercel/speed-insights` + `AnalyticsGate`: no-op fora da Vercel (peso morto).
   Remover ou trocar por self-hosted; limpar CSP (`va.vercel-scripts.com`/`vitals.vercel-insights.com`
   em `next.config.ts:34-35`). **Manter enquanto estiver na Vercel** (hoje coletam de verdade).
2. **Crítico p/ negócio:** `vercel/client.ts` faz TODA a anexação de domínio próprio de revenda
   (`add`/`verify`/`remove`/`getDomainConfig` — aprofundado pelo commit `a42ccb8`). Reimplementar como
   provider do alvo: **Traefik** (router dinâmico + certresolver Let's Encrypt) **ou** **Cloudflare for
   SaaS** (custom hostnames API) — coerente com a decisão "VPS + Cloudflare". Ajustar
   `urls.ts:cnameTarget()` e `vercelApexIp()`.
3. Wildcard `*.livrecursos.com.br`: cert wildcard via DNS-01 (Traefik) ou Cloudflare proxied.

**Verificação:** `grep -rn "@vercel/" src` → vazio; anexar domínio custom de teste gera roteamento + cert
válido; `*.livrecursos.com.br` resolve com cert wildcard.

---

## OPS-007 — Secrets do orquestrador (`*_FILE`)

**Achado:** P2 · `scripts/apply-pending-migrations.mjs:54`, `src/lib/supabase/storage.ts:5`,
`src/lib/certificates/storage.ts:5`, `src/lib/storage/payout-proof.ts:11`, `src/lib/env.ts`, `.env.example`.

**O que muda:** hoje segredos de alto poder são injetados como env na Vercel: `SUPABASE_SERVICE_ROLE_KEY`,
`ENCRYPTION_KEY`, `CRON_SECRET`, `INTERNAL_SECRET`, `ASAAS_API_KEY`, `MP_WEBHOOK_SECRET`,
`PMB_WEBHOOK_SECRET`, `LMS_API_KEY`, `VAPID_PRIVATE_KEY`, `SMTP_PASSWORD`.

- Definir `secrets:` no compose/stack e ler via `/run/secrets/*`.
- Atualizar `src/lib/env.ts` para aceitar variantes **`*_FILE`** (ler o conteúdo do arquivo quando a env
  aponta para um path), começando pelos de maior poder (SERVICE_ROLE_KEY, ENCRYPTION_KEY,
  DATABASE_URL/DIRECT_URL, ASAAS_API_KEY, LMS_API_KEY, PMB_WEBHOOK_SECRET).
- **NUNCA** commitar o stack com valores.

> Observação: o suporte `*_FILE` em `env.ts` é aditivo (sem `*_FILE` o comportamento na Vercel é
> idêntico), mas fica **inerte** sem o orquestrador; por isso entra no cutover, não antes.

**Verificação:** stack sobe lendo de `/run/secrets`; nenhum segredo em `docker history` nem no `.env` do host.

---

## OPS-008 — Pooling Supavisor → pgBouncer + backups testados

**Achado:** P2 · `src/lib/prisma.ts:15-20` (Pool `pg` sobre `DATABASE_URL`, `max` = `DATABASE_POOL_MAX ?? 10`),
`scripts/apply-pending-migrations.mjs:54` (migrations via `DIRECT_URL`), `.env.example`.

**O que muda:** self-hostando Postgres, o Supavisor some.

1. Provisionar **pgBouncer** (transaction pooling); `DATABASE_URL` → pgBouncer, `DIRECT_URL` → direto ao
   Postgres (migrations).
2. Revisar `max` do Pool (`prisma.ts:17`) em função do pgBouncer (o teto de 60 conexões citado em
   `prisma.ts:10-13` muda).
3. Definir e **testar** backup: `pg_dump`/`pg_basebackup` + WAL archiving/PITR + **restore validado** num
   host limpo, agendado e monitorado.
4. Sem RLS no banco (isolamento em código) → recriar só extensões usadas (`pg_cron`, `pg_net`) e roles;
   não há policies para portar. `ALTER TYPE ADD VALUE` nas migrations exige **PG12+**.

**Verificação:** app sobe contra pgBouncer sem esgotar conexões sob carga; restore de backup recente
reconstrói o banco num host limpo (drill documentado).

---

## OPS-009 — Crons: pg_cron/pg_net → scheduler próprio na VPS

**Achado:** P2 · `prisma/sql/pg_cron_jobs.sql` (13 jobs via `app_internal.run_cron` → `net.http_post`),
`src/app/api/cron/**` (17 handlers), `vercel.json` (`"crons": []`).

**O que muda:** Postgres self-hosted comum **não** tem `pg_cron`/`pg_net`. Sem eles, nenhum cron periódico
roda (sync catálogo EA/LMS, bloqueio de inadimplentes, payout de comissões, reconciliação, day-update LMS).

Escolher:
- **(a)** instalar `pg_cron` + `pg_net` no Postgres self-hosted e recriar `app_internal.run_cron` + os 13
  jobs de `pg_cron_jobs.sql`; **ou**
- **(b)** trocar por cron de sistema/container (serviço no orquestrador com `curl` autenticado, `ofelia`,
  ou GitHub Actions schedule) chamando `/api/cron/*` com `Authorization: Bearer CRON_SECRET`.

Converge com OPS-013 (heartbeat/alerta de cron parado). Manter `pg_cron_jobs.sql` versionado.

**13 jobs periódicos:** sync-cursos, sync-progresso, sweep-tenants-overdue, sweep-students-overdue,
reactivate-paid, referral-monthly-payout, cleanup-webhook-logs, sweep-abandoned-leads,
sweep-students-expired, sweep-visitor-events, sync-cursos-lms, sync-day-update-lms,
reconcile-tenant-payments. (4 handlers on-demand — fix-gateway-collapse, resync-lms-credentials,
resync-platform-passwords, sync-lms-branding — não entram em agendamento.)

**Verificação:** os 13 handlers periódicos têm agendador ativo na VPS; execução de teste de cada retorna 200.

---

## OPS-011 — Staging fiel + ADR-002 + plano de cutover

**Achado:** P3 · `docs/architecture/` (só ADR-001), `vercel.json`, `.github/workflows/ci.yml` (sem deploy
de staging).

**Checklist de cutover (a formalizar em ADR-002):**

1. **Pré:** stack de staging na VPS com **mesma versão** de Node (`.nvmrc`, ver OPS-010)/Postgres/Redis/
   MinIO, dados realistas anonimizados. Ensaiar o cutover inteiro lá primeiro.
2. **DNS/TTL:** baixar TTL dos registros com antecedência; apex + wildcard `*.livrecursos.com.br` +
   custom domains (ver OPS-006).
3. **Ordem de migração de dados:** (i) dump Postgres + restore (OPS-008); (ii) migrar objetos de storage e
   **reescrever URLs persistidas** (OPS-005); (iii) recriar scheduler (OPS-009).
4. **Segredos:** via `/run/secrets` (OPS-007), nunca em layer/`.env` de host.
5. **Redis/Proxy:** validar cache de tenant + rate-limit em Node/TCP (OPS-003/OPS-004).
6. **Deploy:** remover acoplamento build↔schema-prod da Vercel (contexto OPS-001, decisão do dono —
   fora desta rodada) e adotar step de migração dedicado no pipeline SSH.
7. **Rollback:** manter a Vercel de pé até `/api/health` 200 na VPS com todas as integrações verdes;
   janela com reversão de DNS pronta.
8. **Pós-migração:** rodar `/auditoria` + Portão Zero-Erro na VPS; conferir crons executando (OPS-013).

**Verificação:** ADR-002 existe com este checklist; stack de staging responde `/api/health` 200 com todas
as integrações; ensaio executado e registrado.

---

## Resumo — o que NÃO muda na Vercel hoje

Nada deste documento altera o runtime atual. As únicas mudanças seguras/aditivas já aplicadas na rodada
2026-07-03 são o **`.nvmrc` + `node-version-file` no CI** (OPS-010) — pinagem de dev/CI que a Vercel
ignora. Todo o resto acima só entra no cutover, sob ADR-002 e staging fiel.
