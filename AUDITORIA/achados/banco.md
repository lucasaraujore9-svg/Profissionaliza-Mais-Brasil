# Auditoria — Banco de Dados
_Data: 2026-06-20 · Referência: .claude/skills/auditoria-saas/references/02-banco-dados.md · Itens do inventário cobertos: 43/43 models · 67/67 migrations · prisma/sql · seed · apply-pending · src/lib/prisma.ts · libs de storage/tenant_

## Resumo
- Itens verificados: 43 models + 32 enums + 67 migrations + runner de migrations + seed + 2 libs de Storage + camada de tenant.
- Achados: **P0=1 · P1=2 · P2=4 · P3=3**
- Nota do domínio: **6.5/10** — modelagem forte e bem indexada nas tabelas quentes (Enrollment/Payment/TenantPayment com índices compostos corretos), FKs com `onDelete` pensado, sem migrações destrutivas, runner idempotente com advisory-lock e tracking. Puxam a nota pra baixo: bucket público com PII (CPF em certificados) ainda aberto, FKs sem índice em colunas de junção/cascata, e a ausência total de RLS (isolamento 100% em código) que vira risco estrutural na migração p/ Postgres self-hosted.

## Achados

### [DB-001] Buckets do Supabase Storage são PÚBLICOS e guardam PII (CPF/nome em certificados; comprovantes financeiros)
- **Severidade:** P0
- **Status:** Aberto
- **Local:** src/lib/certificates/storage.ts:1 (`BUCKET = "certificates"`), :82 (`certificatePublicUrl`) · src/lib/certificates/generate-pdf.ts:172 (`data: { pdfUrl: upload.publicUrl }`) · src/lib/supabase/storage.ts:1 (`BUCKET = "vitrine-assets"`), :68 (`publicUrlFor`) · src/app/api/admin/financeiro/referral-payouts/[id]/proof/route.ts:101,119,124 (comprovante de saque → `vitrine-assets` público)
- **Evidência:** O PDF do certificado é gravado e o `Certificate.pdfUrl` persiste a URL **pública** (`/storage/v1/object/public/certificates/{tenantId|pmb}/{code}.pdf`). O PDF embute `studentName` + `studentCpf` (snapshot, schema.prisma:1772-1773). Existe `createSignedCertificateUrl` (storage.ts:94) mas o próprio comentário diz que tornar o bucket privado é "pré-requisito (issue 100/R1)" — ou seja, **o bucket ainda é público** e o read path padrão (generate-pdf.ts:172) usa a URL pública. Confirmado na memória do projeto: "R1 (CPF em bucket público) ainda aberto". O caminho do certificado é `{tenantId}/{code}.pdf` com `code` curto (ex. `PMB-7K3X9A2`, schema.prisma:1758) — enumerável. Comprovantes de saque (documentos financeiros) também vão para o bucket público `vitrine-assets` em `comprovantes/{payoutId}/{ts}-{rand}.ext`.
- **Impacto:** Vazamento de PII (CPF + nome completo de alunos) e de documentos financeiros a qualquer um na internet que descubra/enumere a URL, sem autenticação. Violação de LGPD (art. 6, 46). Bucket público com PII é P0 explícito na referência (§7).
- **Correção:**
  1. No Supabase: tornar os buckets `certificates` e `vitrine-assets` **privados** (ou criar bucket privado dedicado `certificates-private` e `comprovantes-private` e migrar os objetos). Ação de console/infra — descrever para o usuário executar (não automatizável pelo corretor).
  2. Trocar o read path de certificados para signed URL: em `generate-pdf.ts:172` persistir o **path** (não a URL pública) e servir sempre via `createSignedCertificateUrl` (já existe) ou via stream autenticado `GET /api/student/certificates/[id]/download` (que já valida `cert.studentId === session.studentId`). Atualizar `src/components/painel/certificate-layout-selector.tsx:279,288` e `src/app/validar/[code]/page.tsx` (já usa signed em :291) para nunca usar `certificatePublicUrl`.
  3. Comprovantes de saque: subir em bucket privado e servir via rota autenticada (`/api/painel/indicacoes/...`) com signed URL de curta duração; nunca persistir `proofUrl` como URL pública.
  4. Backfill: regerar/re-assinar URLs já gravadas em `Certificate.pdfUrl` e `ReferralPayout.proofUrl` que apontam para `/object/public/`.
- **Verificação:** `GET` direto na URL pública de um certificado existente deve retornar 400/403 (bucket privado). Teste: aluno A não consegue baixar o PDF do aluno B via `/api/student/certificates/[id]/download` (403). Conferir no Supabase `select id, public from storage.buckets where id in ('certificates','vitrine-assets');` → `public=false`.

### [DB-002] FKs sem índice em colunas de junção/cascata (Postgres não indexa FK automaticamente)
- **Severidade:** P1
- **Status:** Aberto
- **Local:** prisma/schema.prisma — `Enrollment.soldByUserId`(:897), `Enrollment.couponId`(:939), `Enrollment.tenantCourseId`(:893); `Payment.soldByUserId`(:1000), `Payment.couponId`(:1018); `Coupon.createdByUserId`(:1044); `Certificate.courseId`(:1765, só coberto por `@@index([tenantId, courseId])`:1798 onde courseId NÃO é coluna líder); `VisitorEvent.courseId`(:2007); `StudentNote.authorId`(:506); `TenantSupportNote.authorId`(:487); `TenantPayment.markedPaidById`(:1103); `ReferralPayout.markedPaidById`(:1625), `ReferralPayout.proofUploadedById`(:1632); `TrainingProgress.videoId`(:2123, só coberto por `@@unique([userId, videoId])` onde videoId não é líder).
- **Evidência:** Cross-check de todas as 75 declarações `fields: [...]` contra `@@index`/`@@unique`/`@unique` (grep confirmou que `soldByUserId`, `couponId`, `createdByUserId`, `markedPaidById`, `proofUploadedById`, `authorId`, `tenantCourseId` não aparecem em NENHUM índice/unique). As tabelas quentes (`enrollments`, `payments`) crescem indefinidamente; `courses` é referenciada por `certificates`/`visitor_events`/`course_package_items`.
- **Impacto:** (a) DELETE/UPDATE de um `User`, `Coupon`, `Course` ou `TenantCourse` força **seq scan** das tabelas filhas para checar/aplicar a constraint (`ON DELETE SET NULL`/`RESTRICT`) — pode travar a transação à medida que os volumes crescem; (b) qualquer consulta por `couponId`/`soldByUserId`/`courseId` (ex. "vendas deste vendedor", "uso deste cupom", "certificados deste curso") vira full scan. A referência (§3) marca FK sem índice como P1/P2.
- **Correção:** Adicionar migration idempotente `prisma/migrations/YYYYMMDD_fk_indexes/migration.sql` com (e refletir os `@@index` no schema.prisma):
  ```sql
  CREATE INDEX IF NOT EXISTS "enrollments_sold_by_user_id_idx" ON "enrollments"("sold_by_user_id");
  CREATE INDEX IF NOT EXISTS "enrollments_coupon_id_idx" ON "enrollments"("coupon_id");
  CREATE INDEX IF NOT EXISTS "enrollments_tenant_course_id_idx" ON "enrollments"("tenant_course_id");
  CREATE INDEX IF NOT EXISTS "payments_sold_by_user_id_idx" ON "payments"("sold_by_user_id");
  CREATE INDEX IF NOT EXISTS "payments_coupon_id_idx" ON "payments"("coupon_id");
  CREATE INDEX IF NOT EXISTS "coupons_created_by_user_id_idx" ON "coupons"("created_by_user_id");
  CREATE INDEX IF NOT EXISTS "certificates_course_id_idx" ON "certificates"("course_id");
  CREATE INDEX IF NOT EXISTS "visitor_events_course_id_idx" ON "visitor_events"("course_id");
  CREATE INDEX IF NOT EXISTS "student_notes_author_id_idx" ON "student_notes"("author_id");
  CREATE INDEX IF NOT EXISTS "tenant_support_notes_author_id_idx" ON "tenant_support_notes"("author_id");
  CREATE INDEX IF NOT EXISTS "tenant_payments_marked_paid_by_id_idx" ON "tenant_payments"("marked_paid_by_id");
  CREATE INDEX IF NOT EXISTS "referral_payouts_marked_paid_by_id_idx" ON "referral_payouts"("marked_paid_by_id");
  CREATE INDEX IF NOT EXISTS "referral_payouts_proof_uploaded_by_id_idx" ON "referral_payouts"("proof_uploaded_by_id");
  CREATE INDEX IF NOT EXISTS "training_progress_video_id_idx" ON "training_progress"("video_id");
  ```
  Observação: como em prod existem tabelas grandes, idealmente `CREATE INDEX CONCURRENTLY` — porém o runner `apply-pending` envolve cada migration em `BEGIN/COMMIT` (ver DB-007) e `CONCURRENTLY` NÃO roda em transação. Aplicar `CONCURRENTLY` manualmente no SQL Editor do Supabase (fora do runner) e registrar como migration de tracking, OU aceitar o lock curto do `CREATE INDEX` normal para tabelas ainda pequenas. Decisão de deploy → corretor PARA e descreve para o usuário.
- **Verificação:** Após aplicar, `EXPLAIN` de `SELECT * FROM payments WHERE coupon_id = $1` usa Index Scan; `select indexname from pg_indexes where tablename='enrollments' and indexname like '%sold_by%';` retorna a linha.

### [DB-003] Sem RLS no banco — isolamento multi-tenant 100% em código (risco estrutural, agrava na migração p/ self-hosted)
- **Severidade:** P1
- **Status:** Aberto
- **Local:** prisma/schema.prisma (43 models, nenhum com policy de tenant) · única RLS existente: prisma/migrations/20260430_notification_preferences/migration.sql:19-23 (`ENABLE ROW LEVEL SECURITY` + policy `deny_anon` em `notification_preferences`) · src/lib/prisma.ts:15-21 (Pool `pg` conectando com a role do `DATABASE_URL`)
- **Evidência:** Varredura de todas as migrations: somente `notification_preferences` tem `ENABLE ROW LEVEL SECURITY`, e sua única policy nega o role `anon` (`USING (false)`). As outras 42 tabelas — incluindo `students` (CPF/RG), `payments`, `enrollments`, `tenant_payments`, `coupons` — **não têm RLS**. O app conecta via Prisma/`pg` com a role do `DATABASE_URL` (provavelmente `postgres`/owner), que **bypassa RLS** mesmo onde existe. Portanto a única policy presente é inócua para o runtime e não há defesa em profundidade: o isolamento depende inteiramente de cada query carregar `where: { tenantId }` (verificado OK nas rotas de loja — ex. src/app/api/loja/courses/route.ts:64,85 e src/lib/tenant/current.ts).
- **Impacto:** Qualquer rota/Server Action que esqueça o filtro `tenantId` vaza dados entre revendas — sem rede de segurança no banco. Hoje mitigado por disciplina de código (281 route handlers), mas é o ponto P0 estrutural citado no INVENTARIO. **⚠️MIGRAÇÃO:** ao sair do Supabase para Postgres self-hosted, some o `anon`/`authenticated`/`service_role` do Supabase; qualquer suposição de RLS some junto e a app continua com a role owner — manter a decisão "isolamento em código" exige cobertura de teste de isolamento por tenant.
- **Correção:** Decisão arquitetural (não é correção mecânica). Opções, em ordem de robustez: (1) habilitar RLS em todas as tabelas com coluna de tenant + rodar o app com uma role NÃO-owner e setar `app.current_tenant`/`SET ROLE` por request (Prisma + `pg` permite via `$executeRaw('SET ...')` no início da transação) — caro, mas é defesa em profundidade real; (2) no mínimo, criar um **teste de isolamento de tenant** automatizado (ver domínio `testes`) que prove que cada listagem de loja/painel filtra por tenant, e um lint/guard que falhe se uma query de modelo tenant-scoped não tiver `tenantId`. Como ação imediata sem rearquitetura: documentar a decisão em ADR e adicionar o teste de isolamento. O corretor deve PARAR e descrever para o usuário (mudança de role/credencial de banco = ação de infra).
- **Verificação:** `select n.nspname, c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.nspname='public' and c.relrowsecurity=false;` lista as 42 tabelas sem RLS (estado atual). Teste de isolamento: criar tenant A e B, popular dados em ambos, autenticar como dono de A e garantir que nenhuma rota retorna registro de B.

### [DB-004] @@unique compostos com `tenantId` NULL não deduplicam no Postgres — códigos PMB podem duplicar (race no findFirst+create)
- **Severidade:** P2
- **Status:** Aberto
- **Local:** prisma/schema.prisma — `Coupon @@unique([tenantId, code])`(:1065); `CoursePackage @@unique([tenantId, slug])`(:756); `AutomationMessageTemplate @@unique([tenantId, key])`(:2038); `CertificateTemplate.tenantId @unique` nullable (:1712). Índice DB: prisma/migrations/20260413_init/migration.sql:383 (`coupons_tenant_id_code_key` — não-parcial).
- **Evidência:** Em Postgres, dois valores NULL são distintos num índice unique. Logo `(NULL, 'PROMO20')` pode ser inserido N vezes — a unicidade de **cupons/pacotes/templates da PMB** (`tenantId=null`) NÃO é garantida pelo banco. O CLAUDE.md confirma a mitigação por `findFirst`+`create` (não `upsert`), e o seed faz isso (prisma/seed.ts:488,508,528 usam `coupon.create` dentro de checagem prévia). Mas `findFirst`+`create` **não é transacional** — duas criações concorrentes do mesmo código PMB passam ambas no findFirst e inserem as duas.
- **Impacto:** Catálogo PMB pode acumular cupons/pacotes/templates duplicados (mesmo código/slug). Na validação de cupom, um `findFirst` por código pode pegar o duplicado errado (inativo/expirado), confundindo desconto. Inconsistência silenciosa de dados.
- **Correção:** Criar índices únicos **parciais** (idempotentes) que cubram o caso PMB:
  ```sql
  CREATE UNIQUE INDEX IF NOT EXISTS "coupons_pmb_code_key" ON "coupons"("code") WHERE "tenant_id" IS NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS "course_packages_pmb_slug_key" ON "course_packages"("slug") WHERE "tenant_id" IS NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS "automation_templates_pmb_key_key" ON "automation_message_templates"("key") WHERE "tenant_id" IS NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS "certificate_templates_pmb_key" ON "certificate_templates"((1)) WHERE "tenant_id" IS NULL;
  ```
  (índices parciais não são expressáveis em `@@unique` do Prisma — adicionar via SQL em migration e documentar; rodar antes garantir que não há duplicatas pré-existentes: `select code, count(*) from coupons where tenant_id is null group by code having count(*)>1;`). Trocar os `findFirst`+`create` por `create` com try/catch em P2002, ou por upsert apoiado nos novos índices.
- **Verificação:** Tentar inserir dois cupons PMB com mesmo `code` deve falhar no 2º (23505). `select code,count(*) from coupons where tenant_id is null group by code having count(*)>1;` retorna vazio.

### [DB-005] `getOrCreatePmbTenant` usa check-then-create (race em cold start de webhook PMB)
- **Severidade:** P2
- **Status:** Aberto
- **Local:** src/lib/pmb-tenant.ts:9-27
- **Evidência:** `findUnique({where:{slug}})` seguido de `create({data:{slug, ...}})`. Dois webhooks MP da vitrine PMB chegando simultaneamente quando o placeholder ainda não existe: ambos veem `null`, ambos chamam `create`, o 2º viola `tenants_slug_key` → P2002 não tratado → o webhook que perde a corrida falha (sem matrícula automática).
- **Impacto:** Falha transitória rara (só na 1ª criação concorrente do tenant `__pmb__`), mas pode derrubar um fulfillment de venda. Webhook deve ser idempotente (referência de API).
- **Correção:** Trocar por upsert idempotente:
  ```ts
  const created = await prisma.tenant.upsert({
    where: { slug: PMB_TENANT_SLUG },
    update: {},
    create: { slug: PMB_TENANT_SLUG, name: PMB_TENANT_NAME, status: "ACTIVE", billingMode: "MANUAL", planValue: 0, referralCode: "__PMB__", updatedAt: new Date() },
    select: { id: true, slug: true },
  })
  ```
- **Verificação:** Teste concorrente (Promise.all de 2 chamadas) retorna o mesmo tenant sem lançar. Não há mais branch `findUnique→create` na função.

### [DB-006] ⚠️MIGRAÇÃO/POOLING — connection string aponta para porta direta (5432) em vez do pooler de transação (6543); pool `pg` por instância serverless pode esgotar conexões
- **Severidade:** P2
- **Status:** Aberto (requer verificação no ambiente de produção)
- **Local:** .env.example:16-17 (`DATABASE_URL`/`DIRECT_URL` ambos `:5432`) · src/lib/prisma.ts:15-20 (Pool `pg`, `max` default 10) · prisma.config.ts:10 (DDL via `DIRECT_URL`)
- **Evidência:** O `.env.example` documenta **ambos** `DATABASE_URL` e `DIRECT_URL` na porta **5432** (conexão direta do Supabase). A referência (§4) é explícita: em serverless (Vercel) o runtime deve usar o **pooler de transação Supavisor na 6543**, reservando a 5432 para DDL. `src/lib/prisma.ts` cria um `Pool` `pg` próprio com `max=10` por instância — com várias instâncias quentes na Vercel, 10×N pode estourar o teto do Supabase (60 no free, comentado no próprio arquivo). O valor real de produção não está no repo (`.env.vercel.production` tem `DATABASE_URL=""`), então é verificação manual.
- **Impacto:** Sob carga, esgotamento de conexões ("remaining connection slots are reserved"/timeouts) → 500s intermitentes em todo o app. Se o runtime estiver mesmo na 5432, o problema é certo ao escalar.
- **Correção:** (verificação manual) Confirmar no Vercel que `DATABASE_URL` de **runtime** aponta para o pooler de transação Supavisor (`...pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1`) e `DIRECT_URL` para a 5432 (DDL/migrations, já é o que `apply-pending`/`prisma.config.ts` usam). Atualizar `.env.example` para refletir 6543 no `DATABASE_URL` e 5432 no `DIRECT_URL`, com `pgbouncer=true&connection_limit=1`. Com pgBouncer em transaction mode, manter `connection_limit=1` por instância no `pg`. **⚠️MIGRAÇÃO VPS:** trocar Supavisor por pgBouncer (transaction mode), revisar `max_connections`; recursos session-mode (prepared statements do `pg`/`LISTEN`) precisam de cuidado — com PrismaPg/`pg` desabilitar prepared statements ou usar a porta session-mode.
- **Verificação:** No Supabase, `select count(*) from pg_stat_activity where usename = current_user;` sob carga não cresce linearmente com o tráfego (prova de pooling). Connection string de runtime contém `:6543` e `pgbouncer=true`.

### [DB-007] Runner de migrations envolve o arquivo inteiro em uma transação — `ALTER TYPE ... ADD VALUE` + uso no mesmo arquivo quebraria; comentário enganoso
- **Severidade:** P3
- **Status:** Aberto
- **Local:** scripts/apply-pending-migrations.mjs:148-156 (BEGIN → `client.query(file.content)` → COMMIT, arquivo inteiro numa transação) · prisma/migrations/20260620_financeiro_role_payout_proof/migration.sql:11-14 (comentário "O apply-pending roda statements separadamente" — incorreto) · também 20260616_commercial_roles_unit_assignment:20-21 e 20260430_student_auth_fields:1
- **Evidência:** O runner executa `file.content` (todos os statements) em UM `client.query` dentro de UM `BEGIN/COMMIT`. As migrations atuais com `ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS` funcionam porque o novo valor **não é usado no mesmo arquivo** (PG 12+ permite ADD VALUE em transação; só proíbe *usar* o valor na mesma txn). Mas o comentário em :13 afirma que o runner "roda statements separadamente" — falso — criando armadilha: a próxima migration que adicionar e **usar** um enum value no mesmo arquivo falhará em prod com "unsafe use of new value". Idem para qualquer `CREATE INDEX CONCURRENTLY` (não roda em txn — ver DB-002).
- **Impacto:** Risco latente de migration que passa em revisão e quebra o deploy (o `apply-pending` roda dentro do `npm run build` — falha aborta o deploy inteiro).
- **Correção:** (1) Corrigir o comentário em 20260620_financeiro_role_payout_proof/migration.sql:13 para refletir que o arquivo roda em transação única. (2) Documentar no cabeçalho de `apply-pending-migrations.mjs` que migrations que precisam rodar fora de transação (ADD VALUE+uso, CONCURRENTLY) devem ser divididas em arquivos separados OU aplicadas manualmente. (3) Opcional: detectar `CONCURRENTLY`/`ADD VALUE` no conteúdo e rodar esses arquivos sem o BEGIN/COMMIT.
- **Verificação:** Adicionar comentário correto; lint manual. Teste: migration de exemplo com `ADD VALUE` + uso no mesmo arquivo falha de forma clara no shadow/staging antes de prod.

### [DB-008] Loops com `await prisma.*` em jobs de sync/cron (N+1 controlado — não-crítico)
- **Severidade:** P3
- **Status:** Aberto
- **Local:** src/lib/lms/day-update.ts:50-95 (update por curso + findFirst/update de enrollment por item) · src/lib/students/progress.ts:182-257 · src/lib/referrals/payout.ts:399-476 · src/app/api/admin/automacao/templates/route.ts:31-115
- **Evidência:** Crons de sincronização (LMS day-update, progresso EA, payout mensal) processam delta record-a-record com uma query por item dentro de `for`. São jobs agendados (pg_cron, horário/diário), não rotas de request, e parte das chamadas envolve match por relação (`course.lmsCourseId`) difícil de agregar em uma só query.
- **Impacto:** Latência do job cresce linear com o tamanho do delta; aceitável para cron, mas pode estourar `maxDuration` em deltas grandes.
- **Correção:** Onde fizer sentido, pré-carregar os enrollments em lote (`findMany({ where: { studentId: { in: [...] } } })`) e indexar em Map antes do loop; trocar updates 1-a-1 por `updateMany`/`$transaction` em chunks. Não bloqueante.
- **Verificação:** Reduzir nº de queries por execução (medir via log de queries em staging); job conclui dentro do `maxDuration`.

## Cobertura

### Models Prisma (43/43) — veredito
- **User** — OK (índices em resetToken/salesManagerId; FK tenantId unique). FK `salesManagerId` indexada. OK.
- **TenantMember** — OK (`@@unique([tenantId,userId])` cobre ambos os FKs líderes? userId NÃO líder → coberto por cascade pequeno; aceitável). OK.
- **Tenant** — OK (7 índices, todos os FKs de gestão indexados: accountManagerId, salesUserId, referrerTenantId).
- **TenantSlugRedirect** — OK (tenantId + expiresAt indexados).
- **TenantSupportNote** — **DB-002** (authorId sem índice).
- **StudentNote** — **DB-002** (authorId sem índice).
- **Course** — OK (provider/status/categoriaLoja/categoryId indexados; `@@unique([provider,nome])` válido — ambos NOT NULL).
- **Category / CourseCategory** — OK.
- **CourseLesson** — OK (`@@unique([courseId,ordem])` cobre courseId líder).
- **TenantCourse** — OK.
- **CoursePackage** — **DB-004** (unique com tenantId NULL não dedupe PMB).
- **CoursePackageItem** — OK (courseId indexado).
- **TenantPackage** — OK.
- **Student** — OK (tenantId/status/plataformaAlunoId/resetToken indexados; CPF/email scoped por tenant). PII residente aqui (cruzar com LGPD).
- **Enrollment** — **DB-002** (soldByUserId/couponId/tenantCourseId sem índice; demais hot paths OK).
- **Payment** — **DB-002** (soldByUserId/couponId sem índice; mp/asaas/tenant indexados OK).
- **Coupon** — **DB-002** (createdByUserId) + **DB-004** (PMB NULL).
- **TenantPayment** — **DB-002** (markedPaidById) — demais índices compostos OK.
- **WebhookLog** — OK (source/processed/createdAt indexados; tenantId SetNull).
- **Lead** — OK (status/email/createdAt/referrerTenantId/ownerUserId indexados).
- **ContactMessage** — OK (studentId + tenantId composto indexados).
- **SystemSettings** — OK (singleton).
- **Notification / NotificationPreference / NotificationCategoryConfig / TenantNotificationOverride** — OK. `notification_preferences` tem RLS deny-anon inócua (ver DB-003).
- **PushSubscription** — OK.
- **ReferralCommission** — OK.
- **ReferralPayout** — **DB-002** (markedPaidById, proofUploadedById sem índice).
- **ReferralMonthlyCommission** — OK.
- **CertificateTemplate** — **DB-004** (tenantId @unique nullable → múltiplos templates PMB possíveis).
- **Certificate** — **DB-001** (PII em bucket público) + **DB-002** (courseId não-líder).
- **BannerSlide / HomeSection** — OK.
- **StudentLead / StudentLeadActivity** — OK.
- **VisitorEvent** — **DB-002** (courseId sem índice). Retenção via cron sweep-visitor-events: OK.
- **AutomationMessageTemplate** — **DB-004** (PMB NULL).
- **AuditLog** — OK (sem FK por design forense; 5 índices).
- **TrainingModule / TrainingVideo** — OK.
- **TrainingProgress** — **DB-002** (videoId não-líder).

### Migrations (67/67)
- Init + 66 incrementais: todas idempotentes (IF NOT EXISTS / DO $$ / ADD COLUMN IF NOT EXISTS) — OK.
- Nenhuma migração destrutiva (0 DROP TABLE/COLUMN, 0 TRUNCATE, 0 ALTER TYPE de coluna) — OK.
- `20260610_fix_run_cron_pg_net_schema` — função `app_internal.run_cron` SECURITY DEFINER com `SET search_path TO ''` + nomes qualificados — **OK** (atende §2 da referência).
- 3 migrations com `ALTER TYPE ADD VALUE` — funcionam hoje, mas runner txn-wrapped é frágil — **DB-007**.
- Reversibilidade (script down): ausente em todas (Prisma forward-only + runner próprio) — risco P2 genérico aceito pelo modelo do projeto; não rebaixa nota isoladamente.

### Outros itens
- **scripts/apply-pending-migrations.mjs** — tracking `_pmb_applied_migrations`, advisory lock não-bloqueante, conexão DIRETA — bom desenho. Ressalva DB-007.
- **prisma/seed.ts** — idempotente (upsert + findFirst+create para NULL composites) — OK (ressalva de race DB-004).
- **src/lib/prisma.ts** — pool `pg` + PrismaPg adapter — ressalva pooling DB-006.
- **prisma/sql/pg_cron_jobs.sql** — agendamento versionado, idempotente por jobname — OK.
- **Storage** (src/lib/supabase/storage.ts, src/lib/certificates/storage.ts) — validação MIME por magic bytes + limite de tamanho no upload de comprovante (OK), MAS buckets públicos com PII — **DB-001**. **⚠️MIGRAÇÃO MinIO:** portar paths/ACLs; recriar política de bucket privado + signed URL no SDK S3.
- **Tenant scoping** (src/lib/tenant/current.ts, rotas de loja/painel amostradas: loja/courses, loja/cursos/[slug]) — filtram por tenantId via header confiável do proxy — OK em código; sem rede de segurança no banco — **DB-003**.
- **Anonimização LGPD** (api/admin/revendedores/[id]/anonimizar) — SUPER_ADMIN, auditado, preserva registros de negócio — OK.
