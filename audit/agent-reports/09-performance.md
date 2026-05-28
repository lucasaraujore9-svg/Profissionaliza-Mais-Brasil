# Relatório 09 — Performance e Escalabilidade

> **Agente:** Performance e Escalabilidade
> **Data:** 2026-05-28
> **Escopo:** Backend (Prisma/Postgres), dashboards/relatórios, frontend (bundle/imagens), cache/revalidação, connection pool, edge/runtime.

---

## Sumário Executivo

| Severidade | Qtd | Achados Principais |
|-----------|-----|-------------------|
| Alto | 3 | Queries sem `take` em relatórios (full-table scan), broadcast `scope=ALL` carrega TODOS os alunos + N+1 de preferences, analytics carrega 6 meses de payments/enrollments em memória |
| Médio | 5 | Dashboard admin: 2 queries sequenciais pós-`Promise.all`, progress-sync serial com sleep, `alunos-por-revendedor` inclui todos estudantes de todos os tenants, cron sem paginação eficiente |
| Baixo | 4 | 178 Client Components sem lazy, `force-dynamic` excessivo na home/vitrine, sem Redis cache em dashboards quentes, DATABASE_URL aponta direto no Postgres (não pooler) |
| Informativo | 2 | Indexes compostos criados em 20260524 cobrem os casos mais frequentes; `@react-pdf/renderer` corretamente no servidor |

---

## Achados Detalhados

---

### [Alto] Relatórios exportam tabelas inteiras sem `take` — risco de OOM + timeout

- **Agente responsável:** Performance
- **Categoria:** Banco — queries sem limite
- **Arquivo:** `src/lib/reports/definitions.ts`
- **Linha/trecho:**
  - L182: `prisma.enrollment.findMany({ where, orderBy: ... })` — sem `take`
  - L404: `prisma.student.findMany({ where: ... })` — sem `take`
  - L615: `prisma.payment.findMany({ ... mpStatus: "APPROVED" })` — sem `take`
  - L672/709: `prisma.tenantPayment.findMany(...)` — sem `take`
  - L761/783/796: `prisma.course.findMany` + `prisma.enrollment.findMany` — sem `take`
- **Evidência:** 15 `findMany` em `definitions.ts` sem cláusula `take`. O runner `"vendas-completas"` (L182) busca **todos os enrollments** da tabela sem paginação. O runner `"pagamentos-recebidos"` (L615) busca todos os payments aprovados sem corte de datas obrigatório (filtros `from`/`to` são opcionais).
- **Descrição:** Ao gerar um relatório sem filtro de período, a query traz potencialmente centenas de milhares de linhas para memória do processo Node.js. Com 1000 tenants × 100 alunos × 10 matrículas = 1 Mi de enrollments, o `findMany` sem `take` pode alocar vários GiB.
- **Impacto:** Timeout Vercel (300s `maxDuration`) em produção com volume real; OOM kill do processo; degradação de outras requisições paralelas no mesmo worker.
- **Cenário de risco:** Admin clica "Exportar → Todas as vendas" sem filtrar período. A rota `GET /api/admin/relatorios/vendas-completas` chama o runner que faz `findMany` sem limite. Em banco com 500 k registros, o processo pode consumir 1+ GB antes de o Vercel matar o worker.
- **Recomendação:** Adicionar `take: 50_000` como hard cap nos runners (com aviso no JSON se `rows.length === 50000`). Para relatórios grandes, implementar export assíncrono (job + download por URL assinada). Alternativamente, usar `cursor`-based streaming com `findMany({ cursor, take: 1000 })`.
- **Correção aplicada:** Não
- **Status:** Recomendado
- **Confiança:** Alta

---

### [Alto] Broadcast `scope=ALL` carrega todos os alunos + N+1 de `notificationPreference` por aluno

- **Agente responsável:** Performance
- **Categoria:** Banco — N+1 + full table scan
- **Arquivo:** `src/app/api/admin/notifications/broadcast/route.ts` + `src/lib/notifications.ts`
- **Linha/trecho:**
  - `route.ts:152`: `prisma.student.findMany({ select: { id: true } })` — sem `where`, sem `take`
  - `notifications.ts:135`: `prisma.notificationPreference.findFirst({ where })` chamada dentro de `Promise.all([...userIds].map(async (userId) => isChannelEnabled(...)))`
  - `notifications.ts:181-186`: `Promise.all([...userIds].map(async (userId) => isChannelEnabled(...)))` — 1 query por userId
  - `route.ts:175-180`: batches de 25, mas `createNotification` chama `isCategoryEnabled` (1 query) + `isStudentCategoryEnabled` (2 queries) por aluno = **3 queries por aluno**
- **Evidência:**
  - L152 `broadcast/route.ts`: `const students = await prisma.student.findMany({ select: { id: true } })` — toda tabela `students`.
  - `dispatchToStudents` (L174): batch de 25 chamadas de `createNotification` em paralelo, mas cada `createNotification` para STUDENT executa: `isCategoryEnabled` (1 query), `isStudentCategoryEnabled` (1 findUnique + 1 findUnique = 2 queries). Total: **3 queries × N alunos**.
  - Com 10.000 alunos → 30.000 queries sequenciais (em batches de 25 = 1.200 rounds).
- **Impacto:** Com 5.000 alunos, o broadcast ALL levaria >5 minutos e esgotaria o pool de conexões (max=10). Webhook de MP paralelo falharia com `connectionTimeoutMillis: 5_000`.
- **Cenário de risco:** SUPER_ADMIN envia comunicado para todos os alunos antes de um evento. O endpoint retorna 200 mas fica pendurado dentro do `maxDuration=60` padrão (não tem `maxDuration` explícito nesta rota).
- **Recomendação:**
  1. Carregar todas as preferências de uma vez: `prisma.notificationPreference.findMany({ where: { studentId: { in: studentIds } }, select: { studentId: true, category: true, inApp: true } })` antes do loop.
  2. Substituir `createNotification` individual por `prisma.notification.createMany` único.
  3. Mover a lógica de broadcast para uma fila (Inngest, pg_cron task) e retornar imediatamente com `{ jobId }`.
  4. Adicionar `maxDuration = 300` explícito ou mover para cron.
- **Correção aplicada:** Não
- **Status:** Recomendado
- **Confiança:** Alta

---

### [Alto] Analytics carrega 180 dias de `payments` + `enrollments` em memória para agregar por mês

- **Agente responsável:** Performance
- **Categoria:** Banco — agregação em memória
- **Arquivo:** `src/app/api/admin/analytics/route.ts`
- **Linha/trecho:**
  - L72-75: `prisma.payment.findMany({ where: { ..., createdAt: { gte: subDays(new Date(), 180) } }, select: { amount: true, createdAt: true } })`
  - L76-79: `prisma.enrollment.findMany({ where: { createdAt: { gte: subDays(new Date(), 180) } }, select: { createdAt: true, status: true, mpPaymentId: true, asaasPaymentId: true } })`
  - L118-137: loops `for (const p of revenueByMonth)` e `for (const e of studentsByMonth)` agrupando em `Map` em JS
- **Evidência:** Dois `findMany` sem `take` que buscam registros de 6 meses inteiros (180 dias) de `payments` e `enrollments`. Com 10.000 pagamentos/mês → 60.000 registros carregados em RAM apenas para calcular 6 buckets mensais.
- **Impacto:** ~60–200 MB de RSS por request de analytics. Em ambiente serverless (Vercel), cada instância fria repaga esse custo.
- **Cenário de risco:** Admin abre `/admin/analytics` com período `12m`; os `subDays(180)` continuam fixos (não respeitam o parâmetro `period`), então sempre 180 dias independentemente do filtro selecionado.
- **Recomendação:** Substituir os dois `findMany` por `$queryRaw` com `date_trunc` (igual ao padrão já usado em `buildRevenueChart` no dashboard admin em `dashboard/route.ts:184`):
  ```sql
  SELECT date_trunc('month', created_at) AS bucket, SUM(amount)::float AS total
  FROM payments WHERE created_at >= $1 AND mp_status='APPROVED'
  GROUP BY bucket ORDER BY bucket
  ```
  Isso entrega os 6 buckets diretamente do Postgres sem carregar registros individuais.
- **Correção aplicada:** Não
- **Status:** Recomendado
- **Confiança:** Alta

---

### [Médio] `buildAlerts()` no dashboard admin executa 3 queries APÓS o `Promise.all` principal

- **Agente responsável:** Performance
- **Categoria:** Banco — queries sequenciais
- **Arquivo:** `src/app/api/admin/dashboard/route.ts`
- **Linha/trecho:**
  - L105: `const chart = await buildRevenueChart(...)` — sequencial após o `Promise.all`
  - L107: `const topResellersRaw = await prisma.tenant.findMany(...)` — sequencial
  - L142: `const alerts = await buildAlerts()` — sequencial, chama 3 queries internas (L233, L251, L264)
- **Evidência:** O `Promise.all` (L35-87) executa 13 queries em paralelo corretamente. Mas `chart`, `topResellersRaw` e `alerts` são executados sequencialmente depois, adicionando 3 roundtrips adicionais. Cada chamada ao banco tem ~5-20ms de latência mínima (Supabase cloud).
- **Impacto:** +3-5 roundtrips desnecessários por request de dashboard. Estimativa: +20-80ms por request.
- **Recomendação:** Incluir `buildRevenueChart`, `topResellersRaw` e `buildAlerts` (ou suas sub-queries) no mesmo `Promise.all` principal. Como `buildAlerts` faz 3 queries, extraí-las para o array principal.
- **Correção aplicada:** Não
- **Status:** Recomendado
- **Confiança:** Alta

---

### [Médio] `syncStudentProgress` — `enrollment.update` em loop sequencial (N queries)

- **Agente responsável:** Performance
- **Categoria:** Banco — N+1 em escrita
- **Arquivo:** `src/lib/students/progress.ts`
- **Linha/trecho:**
  - L256-260: `for (const u of updates) { await prisma.enrollment.update({ where: { id: u.enrollmentId }, data: u.data }) }`
  - L265-274: `for (const enrollmentId of toIssueCert) { await issueCertificateIfEligible(enrollmentId, "AUTO") }` (comentado "sequencial para não saturar render PDF")
- **Evidência:** Loop `for...await` em L256 atualiza cada enrollment individualmente. Se um aluno tem 5 cursos ativos, são 5 queries sequenciais de UPDATE em vez de 1 `updateMany` por campo ou `$transaction`.
- **Impacto:** No cron `sync-progresso` (L9: `BATCH_SIZE = 100` alunos × 5 enrollments = 500 UPDATEs seriais por batch), com 200ms de sleep entre alunos, o cron leva: 100 × (API_call + 5×db_update + 200ms) ≈ 50+ segundos por batch.
- **Recomendação:** Agrupar os updates em `$transaction(updates.map(u => prisma.enrollment.update(...)))` ou usar `updateMany` quando os dados são uniformes (ex.: `progressSyncedAt`). Para campos variáveis, `$transaction` ainda reduz roundtrips.
- **Correção aplicada:** Não
- **Status:** Recomendado
- **Confiança:** Alta

---

### [Médio] Relatório `alunos-por-revendedor` inclui todos os estudantes de cada tenant via `include`

- **Agente responsável:** Performance
- **Categoria:** Banco — include excessivo
- **Arquivo:** `src/lib/reports/definitions.ts`
- **Linha/trecho:** L479-490:
  ```js
  const tenants = await prisma.tenant.findMany({
    select: {
      students: { select: { status: true } },  // carrega TODOS os students de cada tenant
    }
  })
  ```
  L502-506: agrega em JS `t.students.filter(x => x.status === s).length`
- **Evidência:** `include` de `students` (com `select: { status: true }`) numa query de tenants. Com 200 tenants × 500 alunos = 100.000 registros de student carregados em memória para calcular 4 contagens que o Postgres faz em microssegundos com `GROUP BY`.
- **Impacto:** ~100 k registros × ~50 bytes = ~5 MB de payload para fazer `Array.filter` em JS. Piora com crescimento da base.
- **Recomendação:** Substituir por `groupBy` no Prisma ou SQL raw:
  ```sql
  SELECT tenant_id, status, COUNT(*) FROM students GROUP BY tenant_id, status
  ```
  Depois faz o pivot em memória com os ~N_tenants × 4_status rows (muito menor).
- **Correção aplicada:** Não
- **Status:** Recomendado
- **Confiança:** Alta

---

### [Médio] Cron `sync-progresso` usa sleep sequencial + sem índice em `progressSyncedAt`

- **Agente responsável:** Performance
- **Categoria:** Cron — throughput
- **Arquivo:** `src/app/api/cron/sync-progresso/route.ts`
- **Linha/trecho:**
  - L13: `const DELAY_BETWEEN_STUDENTS_MS = 200`
  - L65-76: loop `for...await` sequencial por studentId com `await sleep(200)`
  - L30-45: query `prisma.enrollment.findMany({ where: { status: "ACTIVE", OR: [{ progressSyncedAt: null }, { progressSyncedAt: { lt: staleBefore } }] }, select: { studentId: true }, take: BATCH_SIZE * 4 })`
- **Evidência:** Com `BATCH_SIZE=100` e 200ms de delay, só o sleep soma 20 segundos por execução. A query de `enrollment` filtra por `progressSyncedAt` (nullable) — não há índice para essa coluna no migration `20260524_composite_indexes` (que só cobre `(tenant_id, status)` e `(student_id, status)`).
- **Impacto:** Query de seleção de alunos stale faz seq-scan parcial em `enrollments` (filtra por `status=ACTIVE` e data — sem índice em `progressSyncedAt`). Com 100 k enrollments ativos, latência de 100-500ms só na seleção.
- **Recomendação:**
  1. Adicionar índice: `CREATE INDEX IF NOT EXISTS "enrollments_progress_synced_at_idx" ON "enrollments"("progress_synced_at") WHERE status = 'ACTIVE'`.
  2. Avaliar se o delay de 200ms ainda é necessário (a API da plataforma parceira pode ter rate limit — se não tiver, remover).
- **Correção aplicada:** Não
- **Status:** Recomendado
- **Confiança:** Média

---

### [Baixo] 178 Client Components sem lazy loading — bundle inicial inclui drawers/tabelas pesadas

- **Agente responsável:** Performance
- **Categoria:** Frontend — bundle size
- **Arquivo:** Todos com `"use client"` (178 arquivos)
- **Linha/trecho:**
  - `src/components/painel/certificate-template-editor.tsx:1` — 1.196 linhas, "use client"
  - `src/components/loja/pmb-checkout-form.tsx:1` — 815 linhas, "use client"
  - `src/components/admin/catalog-edit-drawer.tsx:1` — 745 linhas, "use client"
  - `src/app/cobranca/[paymentId]/checkout-client.tsx:1` — 690 linhas, "use client"
  - `src/components/admin/financeiro-referral-payouts.tsx:1` — 645 linhas, "use client"
- **Evidência:** Zero usos de `dynamic(() => import(...))` encontrados em todo o `src/`. Componentes pesados como `certificate-template-editor.tsx` (1.196 linhas, editor canvas com canvas manipulation) são incluídos no bundle do chunk da página mesmo quando o usuário nunca abre o editor.
- **Impacto:** Aumenta o JS inicial em cada rota admin/painel. Em conexões lentas (3G), cada KB importado conta para FCP/LCP.
- **Recomendação:** Wraps com `next/dynamic` para: drawers/sheets (`catalog-edit-drawer`, `course-edit-drawer`), editores (`certificate-template-editor`), tabelas de financeiro (`financeiro-referral-payouts`), componentes de checkout (`checkout-client`). Exemplo: `const CatalogEditDrawer = dynamic(() => import("@/components/admin/catalog-edit-drawer"), { ssr: false })`.
- **Correção aplicada:** Não
- **Status:** Recomendado
- **Confiança:** Média

---

### [Baixo] `force-dynamic` na home principal e vitrine impede cache estático — custo por request

- **Agente responsável:** Performance
- **Categoria:** Cache / revalidação
- **Arquivo:** `src/app/(main)/page.tsx:9`, `src/app/loja/page.tsx:9`, `src/app/(main)/cursos/page.tsx:117`
- **Linha/trecho:** `export const dynamic = "force-dynamic"`
- **Evidência:** A home `/` e `/loja` (vitrine) têm `force-dynamic`. Isso significa que cada visitante na vitrine (que é a página de maior tráfego público) dispara uma query ao banco. O catálogo de cursos e configurações de vitrine raramente mudam (TTL de 5 min seria suficiente).
- **Impacto:** Cada pageview da vitrine pública cria conexão Prisma → Postgres. Com 100 visitas/min na vitrine de um revendedor popular, são 100 queries/min ao banco desnecessárias.
- **Recomendação:** Para a home PMB (`/`): `export const revalidate = 300` (5 min) com `revalidatePath` chamado quando cursos ou seções forem editados no admin. Para vitrines de revendedor (`/loja`): usar `unstable_cache` com tag `tenant-${slug}` + invalidação no Redis quando `invalidateTenant` já é chamado (as rotas `/api/painel/vitrine/*` já chamam `invalidateTenant`).
- **Correção aplicada:** Não
- **Status:** Recomendado
- **Confiança:** Média

---

### [Baixo] Sem cache Redis para dashboards quentes — cada refresh consulta o banco

- **Agente responsável:** Performance
- **Categoria:** Cache
- **Arquivo:** `src/app/api/admin/dashboard/route.ts`, `src/app/api/painel/dashboard/route.ts`
- **Linha/trecho:** Nenhuma chamada a `cacheGet`/`cacheSet`/`unstable_cache` nos dois arquivos (confirmado por grep).
- **Evidência:** O dashboard do admin (`/api/admin/dashboard`) executa 13 queries em `Promise.all` a cada request. O painel do revendedor (`/api/painel/dashboard`) executa 8 queries + 1 `$queryRaw`. Não há nenhum cache intermediário.
- **Impacto:** Com 20 revendedores atualizando o dashboard ao mesmo tempo, são 160 queries simultâneas (20 × 8). O pool max=10 do Prisma é esgotado, e requests ficam aguardando conexão livre dentro do `connectionTimeoutMillis=5s`.
- **Recomendação:** Cache Redis com TTL de 60-120s por chave `dashboard:admin:{period}` e `dashboard:tenant:{tenantId}:{period}`. Usar `cacheGet`/`cacheSet` já disponíveis em `src/lib/redis/cache.ts`.
- **Correção aplicada:** Não
- **Status:** Recomendado
- **Confiança:** Alta

---

### [Baixo] `DATABASE_URL` aponta direto no Postgres (porta 5432) — sem PgBouncer

- **Agente responsável:** Performance
- **Categoria:** Connection pool
- **Arquivo:** `.env.example:15`, `src/lib/prisma.ts:15-17`
- **Linha/trecho:** `DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres`
- **Evidência:** A URL no `.env.example` usa porta 5432 (conexão direta ao Postgres), não a porta 6543 (Supabase PgBouncer pooler em modo transaction). O Prisma cria um `pg.Pool` com `max: 10` por instância Vercel. Com múltiplas instâncias serverless (ex.: 5 instâncias quentes = 50 conexões), o Supabase free tier tem limite de 60 conexões simultâneas → risco de `remaining connection slots are reserved for non-replication superuser connections`.
- **Impacto:** Sob carga de pico (após campanha, por ex.), as instâncias Vercel podem esgotar conexões disponíveis no Supabase, causando erros `ECONNREFUSED` / `connection timeout` generalizados.
- **Recomendação:** Mudar `DATABASE_URL` para a URL do pooler do Supabase (porta 6543, `?pgbouncer=true`) e adicionar `connection_limit=2` na string de conexão. Manter `DIRECT_URL` na porta 5432 apenas para migrations (`prisma migrate dev`). Isso multiplexia conexões e reduz o teto de conexões por instância Vercel.
- **Correção aplicada:** Não
- **Status:** Requer decisão humana
- **Confiança:** Alta

---

### [Informativo] Indexes compostos criados em 20260524 cobrem os filtros mais frequentes

- **Agente responsável:** Performance
- **Categoria:** Banco — índices
- **Arquivo:** `prisma/migrations/20260524_composite_indexes/migration.sql`
- **Linha/trecho:** Índices `enrollments_tenant_id_status_idx`, `payments_tenant_id_paid_at_idx`, `tenant_payments_tenant_id_status_due_date_idx`
- **Evidência:** A migration cobre os filtros de dashboards por `(tenantId, status)` e relatórios financeiros por `(tenantId, paidAt)`. Cobre os casos mais críticos das queries no painel do revendedor.
- **Impacto:** Positivo — já mitiga os casos de seq-scan mais frequentes.
- **Lacuna identificada:** Falta índice em `enrollments.progress_synced_at` (usado no cron), em `students.tenant_id` para o report `alunos-todos`, e em `notifications.user_id` + `read_at` (já presente no migration de notifications).
- **Status:** Informativo
- **Confiança:** Alta

---

### [Informativo] `@react-pdf/renderer` usado apenas no servidor — correto

- **Agente responsável:** Performance
- **Categoria:** Frontend — bundle
- **Arquivo:** `src/lib/certificates/generate-pdf.ts:1`, `src/lib/referrals/demonstrativo.ts:1`
- **Evidência:** `import { renderToBuffer } from "@react-pdf/renderer"` aparece apenas em `src/lib/` (server-side). Nenhum componente client importa `@react-pdf`. Correto — a biblioteca é pesada (~2 MB) e ficaria no bundle do cliente se importada errado.
- **Status:** Informativo
- **Confiança:** Alta

---

## Itens para Monitorar em Produção

1. **Query slow log do Supabase** (Dashboard → Database → Query Performance): monitorar queries >100ms. Candidatos: `enrollment.findMany` sem `take` nos relatórios, `student.findMany` no broadcast ALL.
2. **Core Web Vitals** (Vercel Analytics ou Lighthouse): LCP da home vitrine (imagem de banner — sem `priority` prop verificado), FID/INP dos drawers pesados.
3. **Connection pool saturation**: alertar quando `pg Pool` atingir `max` conexões — logar `pool.totalCount`, `pool.idleCount` via endpoint `/api/health` existente.
4. **Redis cache hit rate**: instrumentar `cacheGet` retornando hit/miss para detectar quando TTLs estão muito baixos ou chaves não estão sendo invalidadas.
5. **Vercel function duration**: monitorar duração do cron `sync-progresso` (maxDuration=300s) — se ultrapassar 200s regularmente, o batch precisa ser reduzido ou paralelizado.

---

## Top 5 por Impacto Imediato

| Prioridade | Arquivo | Correção |
|-----------|---------|----------|
| 1 | `src/lib/reports/definitions.ts` | Adicionar `take: 50_000` + aviso de truncagem em todos os 15 `findMany` sem limite |
| 2 | `src/app/api/admin/notifications/broadcast/route.ts` + `src/lib/notifications.ts` | Carregar todas as preferences de uma vez; substituir `createNotification` em loop por `createMany` único |
| 3 | `src/app/api/admin/analytics/route.ts:72-79` | Substituir 2 `findMany` de 180 dias por `$queryRaw GROUP BY date_trunc` |
| 4 | `src/lib/prisma.ts` + `DATABASE_URL` | Migrar para PgBouncer (porta 6543) + `connection_limit=2` na URL |
| 5 | `src/app/api/admin/dashboard/route.ts` + `src/app/api/painel/dashboard/route.ts` | Adicionar Redis cache com TTL 60-120s por key `dashboard:{role}:{id}:{period}` |
