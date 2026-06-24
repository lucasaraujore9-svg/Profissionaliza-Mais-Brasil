# Auditoria — Banco de Dados
_Data: 2026-06-24 · Referência: .claude/skills/auditoria-saas/references/02-banco-dados.md · Itens do inventário cobertos: 44/44 models · 75/75 migrations · 33 enums · prisma/sql · seed · apply-pending · src/lib/prisma.ts · 4 libs de Storage · camada de tenant · 16 crons (retenção)_

## Resumo
- Itens verificados: 44 models + 33 enums + 75 migrations + runner de migrations + seed + 4 libs de Storage (certificates / vitrine-assets / payout-proofs / supabase) + camada de tenant + retenção/cron de logs + webhook receiver LMS + credenciais LMS cifradas.
- Achados: **P0=1 · P1=1 · P2=2 · P3=4** (total 8).
- Nota do domínio: **7.5/10** (era 6.5). Subiu: DB-002 (FK sem índice) e DB-005 (race no PMB tenant) fechados; DB-004 (unique parcial PMB) confirmado fechado e com o índice de `course_packages` reordenado corretamente (20260624); comprovantes de saque migrados para bucket privado dedicado `payout-proofs` com leitura por rota autenticada; read path de certificados reescrito para signed URL/stream e o `pdfPathFor` trocado para o `cuid` (não mais o `code` enumerável). Puxam a nota: o bucket `certificates` ainda persiste a URL **pública** em `Certificate.pdfUrl` (privacidade do bucket é setting de console — não verificável no repo) e a ausência total de RLS (isolamento 100% em código), que vira risco estrutural no cutover p/ Postgres self-hosted.

## Achados

### [DB-001] Bucket `certificates` ainda persiste URL PÚBLICA em `Certificate.pdfUrl` e guarda PII (CPF + nome no PDF) — privacidade do bucket não verificável no repo
- **Severidade:** P0
- **Status:** Aberto (parcialmente mitigado; exige verificação manual no Supabase)
- **Local:** src/lib/certificates/generate-pdf.ts:167-175 (`path = pdfPathFor(cert.tenantId, cert.id)` → `pdfUrl: upload.publicUrl`) · src/lib/certificates/storage.ts:79,84 (`certificatePublicUrl` → `/storage/v1/object/public/certificates/{path}`) · prisma/schema.prisma:1822-1823 (`studentName` + `studentCpf` snapshot embutidos no PDF) · prisma/schema.prisma:1832 (`pdfUrl`)
- **Evidência:** `uploadCertificatePdf` continua retornando `publicUrl` (`certificatePublicUrl`, storage.ts:79/84 = caminho `/object/public/certificates/...`), e `generate-pdf.ts:172` ainda grava essa **URL pública** em `Certificate.pdfUrl`. O PDF embute `studentName` + `studentCpf` (schema.prisma:1822-1823). **Mitigações já aplicadas (confirmadas no código):** (a) `pdfPathFor` agora usa `cert.id` (cuid, não exposto) em vez do `code` curto enumerável (generate-pdf.ts:36-42); (b) o read path do aluno (`/api/student/certificates/[id]/download`) faz **stream autenticado** validando o dono (route.ts:55-66); (c) `validar/[code]/page.tsx:282-295` usa **signed URL de 300s** via `createSignedCertificateUrl`, nunca expõe `cert.pdfUrl`; (d) comprovantes de saque migraram para bucket **privado dedicado** `payout-proofs` (src/lib/storage/payout-proof.ts:1-7), com leitura por rota autenticada e gravando o **path** (não a URL pública) em `proofUrl` (proof/route.ts:120-131). **O que permanece:** o repo não prova que o bucket `certificates` está **privado** no Supabase; e enquanto `pdfUrl` guardar a string `/object/public/...`, se o bucket for/voltar a ser público, qualquer um com a URL baixa o PDF com CPF sem autenticação. A memória do projeto (2026-06-23) mantém "R1 (CPF em bucket público) ainda aberto".
- **Impacto:** Se o bucket `certificates` estiver público em produção, há vazamento de PII (CPF + nome completo de alunos) a quem obtiver a URL (compartilhada por e-mail/UI), sem autenticação — violação de LGPD (art. 6, 46). Bucket público com PII é P0 explícito na referência (§7).
- **Correção:**
  1. **(Infra/console — corretor PARA e descreve)** No Supabase, garantir que o bucket `certificates` é **privado**: `select id, public from storage.buckets where id = 'certificates';` deve retornar `public=false`. Se estiver `true`, alterar para privado.
  2. Em src/lib/certificates/generate-pdf.ts:167-175 e src/lib/certificates/storage.ts:79, **parar de persistir a URL pública**: gravar o **path** (`pdfPathFor(...)`) em `Certificate.pdfUrl` (ou em um campo `pdfPath` dedicado) e servir SEMPRE via `createSignedCertificateUrl`/stream autenticado (ambos já existem). Atualizar `uploadCertificatePdf` para retornar só `{ path }`.
  3. Backfill: para linhas de `Certificate.pdfUrl` que já contêm `/object/public/certificates/`, normalizar para o path com `extractCertificatePath` (storage.ts:134) numa migration de dados read-only/idempotente.
- **Verificação:** `GET` direto na URL pública de um certificado existente retorna 400/403 (bucket privado). Aluno A não baixa o PDF de B via `/api/student/certificates/[id]/download` (403, já há teste de escopo `admin-scope.test.ts`). `select id, public from storage.buckets where id='certificates';` → `public=false`. Nenhuma linha de `Certificate.pdfUrl` contém `/object/public/`.

### [DB-002] Sem RLS no banco — isolamento multi-tenant 100% em código (risco estrutural; agrava no cutover p/ Postgres self-hosted)
- **Severidade:** P1
- **Status:** Aberto
- **Local:** prisma/schema.prisma (44 models, nenhum com policy de tenant) · única RLS existente: prisma/migrations/20260430_notification_preferences/migration.sql (`ENABLE ROW LEVEL SECURITY` + policy `deny_anon` em `notification_preferences`) · src/lib/prisma.ts:15-21 (Pool `pg` conectando com a role do `DATABASE_URL`)
- **Evidência:** Varredura de todas as 75 migrations: só `notification_preferences` tem `ENABLE ROW LEVEL SECURITY`, e a única policy nega o role `anon` (`USING (false)`). As outras 43 tabelas — `students` (CPF/RG), `payments`, `enrollments`, `tenant_payments`, `coupons`, `course_packages`, `email_logs` (e-mail), `webhook_logs` (payloads com PII) — **não têm RLS**. O app conecta via `pg`/PrismaPg com a role do `DATABASE_URL` (owner), que **bypassa RLS** mesmo onde existe. A defesa fica 100% no `where: { tenantId }` por query (verificado OK nas rotas amostradas de loja/painel — ex. loja/courses, painel/dashboard tenant-scoped via `$2 = ctx.tenantId`).
- **Impacto:** Qualquer rota/Server Action que esqueça o filtro `tenantId` vaza dados entre revendas — sem rede de segurança no banco. Hoje mitigado por disciplina em 294 route handlers. **⚠️MIGRAÇÃO:** ao sair do Supabase para Postgres self-hosted, somem `anon`/`authenticated`/`service_role`; manter "isolamento em código" exige cobertura de teste de isolamento por tenant antes do cutover.
- **Correção:** Decisão arquitetural (não mecânica), em ordem de robustez: (1) habilitar RLS nas tabelas com coluna de tenant + rodar o app com role NÃO-owner e `SET app.current_tenant`/`SET ROLE` por transação (via `$executeRaw` no início) — defesa em profundidade real; (2) no mínimo, criar um **teste de isolamento de tenant** automatizado (domínio `testes`) que prove que cada listagem de loja/painel filtra por tenant, e um guard/lint que falhe se uma query tenant-scoped não tiver `tenantId`. Ação imediata sem rearquitetura: documentar a decisão em ADR + adicionar o teste de isolamento. Mudança de role/credencial = ação de infra → corretor PARA e descreve.
- **Verificação:** `select n.nspname, c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.nspname='public' and c.relrowsecurity=false;` lista as 43 tabelas sem RLS (estado atual). Teste de isolamento: criar tenant A e B, popular ambos, autenticar como dono de A e garantir que nenhuma rota retorna registro de B.

### [DB-003] ⚠️MIGRAÇÃO/POOLING — connection string em `.env.example` aponta para a porta direta (5432) em vez do pooler de transação (6543); pool `pg` por instância pode esgotar conexões
- **Severidade:** P2
- **Status:** Aberto (requer verificação no ambiente de produção)
- **Local:** .env.example:16-17 (`DATABASE_URL`/`DIRECT_URL` ambos `:5432`) · src/lib/prisma.ts:16-22 (Pool `pg`, `max = DATABASE_POOL_MAX ?? 10`) · prisma.config.ts (DDL via `DIRECT_URL`)
- **Evidência:** O `.env.example` documenta **ambos** `DATABASE_URL` e `DIRECT_URL` na porta **5432** (conexão direta). A referência (§4) é explícita: em serverless (Vercel) o runtime deve usar o **pooler de transação Supavisor na 6543**, reservando a 5432 para DDL. `src/lib/prisma.ts:16-22` cria um `Pool` `pg` com `max=10` por instância — com várias instâncias quentes na Vercel, 10×N pode estourar o teto do Supabase (60 no free, comentado no próprio arquivo). O valor real de produção não está no repo (segredos `Sensitive` não baixam via `vercel env pull` — ver memória), então é verificação manual.
- **Impacto:** Sob carga, esgotamento de conexões ("remaining connection slots are reserved"/timeouts) → 500s intermitentes em todo o app. Se o runtime estiver mesmo na 5432, o problema é certo ao escalar.
- **Correção:** (verificação manual) Confirmar no Vercel que `DATABASE_URL` de **runtime** aponta para o pooler de transação Supavisor (`...pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1`) e `DIRECT_URL` para a 5432 (DDL/migrations, já usado por `apply-pending`/`prisma.config.ts`). Atualizar `.env.example:16-17` para refletir 6543 no `DATABASE_URL` (com `pgbouncer=true&connection_limit=1`) e 5432 no `DIRECT_URL`. Com pgBouncer em transaction mode, `pg`/PrismaPg precisa de prepared statements desabilitados. **⚠️MIGRAÇÃO VPS:** trocar Supavisor por pgBouncer (transaction mode), revisar `max_connections`; recursos session-mode (prepared statements do `pg`/`LISTEN`) exigem cuidado.
- **Verificação:** No banco, `select count(*) from pg_stat_activity where usename = current_user;` sob carga não cresce linearmente com o tráfego (prova de pooling). Connection string de runtime contém `:6543` e `pgbouncer=true`.

### [DB-004] Loops com `await prisma.*` em jobs de sync/cron (N+1 controlado — não-crítico)
- **Severidade:** P2
- **Status:** Aberto
- **Local:** src/lib/lms/day-update.ts:50-95 (update por curso + `findFirst`/`update` de enrollment por item) · src/app/api/cron/resync-lms-credentials/route.ts:84-127 (chunked, mas `update` por enrollment) · src/app/api/cron/sync-lms-branding/route.ts:67-68 (chunked) · src/lib/students/progress.ts · src/lib/referrals/payout.ts
- **Evidência:** Crons de sincronização (LMS day-update, resync de credenciais, branding, progresso EA, payout mensal) processam delta record-a-record com uma query por item. Os mais novos (resync-lms-credentials, sync-lms-branding) já usam concorrência em lotes (`CONCURRENCY` chunks, route.ts:126-127), mas `day-update.ts:71,82` ainda faz `findFirst`+`update` por item de curso. São jobs agendados (pg_cron), não rotas de request, e parte das chamadas envolve match por relação (`course.lmsCourseId`/nome) difícil de agregar.
- **Impacto:** Latência do job cresce linear com o delta; aceitável para cron, mas pode estourar `maxDuration` em deltas grandes.
- **Correção:** Onde fizer sentido, pré-carregar enrollments em lote (`findMany({ where: { studentId: { in: [...] } } })`) e indexar em Map antes do loop; trocar updates 1-a-1 por `updateMany`/`$transaction` em chunks. Não bloqueante.
- **Verificação:** Reduzir nº de queries por execução (medir via log de queries em staging); job conclui dentro do `maxDuration`.

### [DB-005] Runner de migrations envolve cada arquivo inteiro em UMA transação — 4 migrations já misturam `ALTER TYPE ... ADD VALUE` com outros statements (armadilha latente: usar o valor no mesmo arquivo quebra o deploy)
- **Severidade:** P3
- **Status:** Aberto
- **Local:** scripts/apply-pending-migrations.mjs:153-172 (`BEGIN` → `client.query(file.content)` → `COMMIT`, arquivo inteiro em UMA transação) · prisma/migrations/20260628_lms_webhook_receiver/migration.sql:7-11 (`ALTER TYPE "WebhookSource" ADD VALUE 'LMS'` + `CREATE UNIQUE INDEX` no MESMO arquivo) · também 20260430_student_auth_fields, 20260616_commercial_roles_unit_assignment, 20260620_financeiro_role_payout_proof
- **Evidência:** O runner executa `file.content` (todos os statements) em UM `client.query` dentro de UM `BEGIN/COMMIT` (linha 158-166). As 4 migrations com `ALTER TYPE ... ADD VALUE` funcionam porque o novo valor **não é usado** no mesmo arquivo (PG 12+ permite `ADD VALUE` em transação; só proíbe **usar** o valor na mesma txn). Em 20260628 o `CREATE UNIQUE INDEX webhook_logs_external_event_id_key` não referencia `'LMS'`, então passa. Mas o desenho é frágil: a próxima migration que adicionar **e usar** um enum value (ou um `CREATE INDEX CONCURRENTLY`, que não roda em txn — ver DB-007 histórico) no mesmo arquivo falhará em prod com "unsafe use of new value", abortando o deploy (o `apply-pending` roda dentro do `npm run build`).
- **Impacto:** Risco latente de migration que passa em revisão e quebra o deploy inteiro.
- **Correção:** (1) Documentar no cabeçalho de `apply-pending-migrations.mjs` que migrations que precisam rodar fora de transação (`ADD VALUE`+uso no mesmo arquivo, `CONCURRENTLY`) DEVEM ser divididas em arquivos separados. (2) Opcional: detectar `CONCURRENTLY`/`ADD VALUE` no `file.content` e rodar esses arquivos sem o `BEGIN/COMMIT` (commit por statement). (3) Convenção: `ADD VALUE` sempre numa migration isolada, antes da migration que usa o valor.
- **Verificação:** Migration de exemplo com `ADD VALUE` + uso no mesmo arquivo falha de forma clara no shadow/staging antes de prod; cabeçalho do runner reflete o comportamento real (transação por arquivo).

### [DB-006] `email_logs` (com e-mail em texto plano = PII) não tem rotina de retenção/limpeza; só `webhook_logs` é purgado
- **Severidade:** P3
- **Status:** Aberto
- **Local:** prisma/schema.prisma:1455-1469 (`EmailLog.to` = e-mail cru, `@db.Text`; sem FK) · src/lib/email/mailer.ts:121-135 (`prisma.emailLog.create` best-effort em todo envio) · src/app/api/cron/cleanup-webhook-logs/route.ts (purga só `webhook_logs`, RETENTION_DAYS=90) · prisma/sql/pg_cron_jobs.sql (sem job para `email_logs`)
- **Evidência:** `EmailLog` registra TODA tentativa de envio com `to` = endereço de e-mail em texto plano (mailer.ts:124). O cron `cleanup-webhook-logs` (retenção 90d) apaga **apenas** `webhook_logs` (route.ts:34-39); não há cron para `email_logs` em `pg_cron_jobs.sql` nem em lugar nenhum. A tabela cresce indefinidamente acumulando PII (e-mails) e payloads de assunto.
- **Impacto:** Crescimento ilimitado de uma tabela com PII (e-mails) — custo de storage + risco LGPD de retenção sem limite (princípio da limitação temporal, art. 15/16 LGPD — cruzar com domínio `lgpd`). Em volume alto, queries em `email_logs` degradam.
- **Correção:** (1) Estender o cron `cleanup-webhook-logs` (ou criar `cleanup-email-logs`) para `prisma.emailLog.deleteMany({ where: { createdAt: { lt: cutoff } } })` com retenção definida (ex. 90d, alinhada ao webhook). (2) Se criar cron novo, registrar o `cron.schedule` correspondente em `prisma/sql/pg_cron_jobs.sql` (idempotente por jobname) e sinalizar no deploy. **⚠️MIGRAÇÃO VPS:** o agendamento depende de pg_cron no Supabase; no cutover, recriar o job no Postgres self-hosted (pg_cron) ou no scheduler do Swarm.
- **Verificação:** Após a retenção, `select count(*) from email_logs where created_at < now() - interval '90 days';` = 0; `select jobname from cron.job where jobname like '%email%';` retorna o job.

### [DB-007] Comprovante de saque com PATH no bucket privado — OK; mas FK auditoria sem índice em colunas raramente consultadas (não-crítico)
- **Severidade:** P3
- **Status:** Aberto
- **Local:** prisma/schema.prisma:754 (`CoursePackage.createdByUserId` — sem FK, sem índice) · :1341 (`ContactMessage.resolvedByUserId` — sem FK, sem índice) · :1822 (campos de auditoria denormalizados sem FK em geral)
- **Evidência:** Algumas colunas de **auditoria denormalizada** (registro de "quem criou/resolveu") não têm FK nem índice — por design (sem cascade, forense). `CoursePackage.createdByUserId` (754) e `ContactMessage.resolvedByUserId` (1341) são `String?` sem `@relation` e sem `@@index`. Não há cascade (sem FK), então não há risco de seq-scan em DELETE de pai; e nenhuma listagem filtra por essas colunas hoje.
- **Impacto:** Nenhum impacto de integridade ou cascade. Só viraria problema se surgir um relatório "pacotes criados por X" / "atendimentos resolvidos por Y" sobre tabela grande — aí faria seq scan.
- **Correção:** Não-bloqueante. Se/quando surgir consulta por essas colunas, adicionar `@@index([createdByUserId])` / `@@index([resolvedByUserId])` via migration idempotente. Manter sem FK (decisão forense) é aceitável.
- **Verificação:** N/A até existir consulta por essas colunas; então `EXPLAIN` deve usar Index Scan.

### [DB-008] Drift schema↔banco: 4 índices de FK existem no banco (migrations SQL antigas) mas NÃO estão declarados em `schema.prisma`
- **Severidade:** P3
- **Status:** Aberto
- **Local:** prisma/migrations/20260414_expand_roles/migration.sql:28,33 (`enrollments_sold_by_user_id_idx`, `payments_sold_by_user_id_idx`) · prisma/migrations/20260522_financial_manual_management/migration.sql:19,32 (`tenant_payments_marked_paid_by_idx`, `referral_payouts_marked_paid_by_idx`) · ausentes em prisma/schema.prisma (models Enrollment/Payment/TenantPayment/ReferralPayout)
- **Evidência:** As colunas `sold_by_user_id` (enrollments/payments) e `marked_paid_by_id` (tenant_payments/referral_payouts) **já têm índice no banco** desde 2026-04-14/05-22 (SQL acima) — corretamente, o `20260620_fk_indexes` as excluiu ("JÁ tinham índice"). Porém esses `@@index` **não constam no schema.prisma** (grep de `enrollments_sold_by_user_id_idx` etc. no schema = 0 ocorrências). Isso corrige o registro do DB-002 anterior, que reportou essas colunas como "sem índice" — elas nunca estiveram sem índice no banco; o gap era só de declaração no schema. **Não há impacto de performance** (o banco tem os índices).
- **Impacto:** Nenhum em runtime/performance. O risco é apenas de processo: se alguém rodar `prisma migrate diff`/`db push` (não usado neste projeto — runner próprio), o Prisma veria esses índices como "extras"/drift e poderia sugerir dropá-los. Inconsistência de documentação.
- **Correção:** Adicionar os `@@index` correspondentes no schema.prisma (sem migration nova — os índices já existem no banco; o `apply-pending` não roda `prisma migrate`):
  - `Enrollment`: `@@index([soldByUserId], map: "enrollments_sold_by_user_id_idx")`
  - `Payment`: `@@index([soldByUserId], map: "payments_sold_by_user_id_idx")`
  - `TenantPayment`: `@@index([markedPaidById], map: "tenant_payments_marked_paid_by_idx")`
  - `ReferralPayout`: `@@index([markedPaidById], map: "referral_payouts_marked_paid_by_idx")`
- **Verificação:** `npx prisma validate` OK; o schema lista os 4 `@@index`; `npx tsc --noEmit` verde (não muda runtime).

## Cobertura

### Models Prisma (44/44) — veredito
- **User** — OK (resetToken/salesManagerId indexados; FK tenantId unique).
- **TenantMember** — OK (`@@unique([tenantId,userId])`).
- **Tenant** — OK (accountManagerId/salesUserId/referrerTenantId indexados; novas colunas `canSellResellers`/`commission_*` são escalares, sem FK).
- **TenantSlugRedirect** — OK (tenantId + expiresAt indexados).
- **TenantSupportNote** — OK (authorId indexado via 20260620_fk_indexes).
- **StudentNote** — OK (authorId indexado via 20260620_fk_indexes).
- **Course** — OK (provider/status/categoriaLoja/categoryId indexados; `@@unique([provider,nome])`).
- **Category / CourseCategory** — OK.
- **CourseLesson** — OK (`@@unique([courseId,ordem])`).
- **TenantCourse** — OK.
- **CoursePackage** — OK em índices (tenantId+enabled; partial-unique PMB em 20260624). `createdByUserId` sem FK/índice — **DB-007** (denormalizado, N/A de integridade).
- **CoursePackageItem** — OK (`@@unique([packageId,courseId])` + `course_id` indexado; FKs cascade).
- **TenantPackage** — OK (`@@unique([tenantId,packageId])` + tenantId+isVisible).
- **Student** — OK (tenantId/status/plataformaAlunoId/resetToken/lmsStudentId; CPF/senha cifrada; PII — cruzar LGPD).
- **Enrollment** — OK em índices (couponId/tenantCourseId/coursePackageId/lmsEnrollmentId agora indexados; soldByUserId indexado no banco — **DB-008** drift de schema). `lmsSenha` cifrada (fulfill.ts:763,883) — OK.
- **Payment** — OK (couponId indexado; soldByUserId indexado no banco — **DB-008**).
- **Coupon** — OK (createdByUserId indexado via 20260620_fk_indexes) + partial-unique PMB (20260620) — DB-004 anterior FECHADO.
- **TenantPayment** — OK (markedPaidById indexado no banco — **DB-008**).
- **WebhookLog** — OK. `externalEventId @unique` (índice regular, NULLs distintos → MP/Asaas com NULL não colidem; comentário do schema diz "parcial" mas o índice é regular — inofensivo). Idempotência LMS race-safe (route.ts:154-166). Retenção 90d (só processed=true).
- **EmailLog** — OK em índices (status+createdAt, to, tenantId; `tenantId` denormalizado sem FK, por design). **DB-006** (sem retenção; PII em `to`).
- **Lead** — OK (status/email/createdAt/referrerTenantId/ownerUserId indexados).
- **ContactMessage** — OK (`@@index([tenantId,status,createdAt])` + studentId). `resolvedByUserId` sem FK/índice — **DB-007** (denormalizado). Roteamento de suporte LMS por tenant — OK.
- **SystemSettings** — OK (singleton; novas colunas commission_* escalares/JSONB).
- **Notification / NotificationPreference / NotificationCategoryConfig / TenantNotificationOverride** — OK. `notification_preferences` tem RLS deny-anon inócua (ver DB-002).
- **PushSubscription** — OK.
- **ReferralCommission** — OK (referrerTenantId+status, referredTenantId, payoutId indexados).
- **ReferralPayout** — OK (proofUploadedById indexado via 20260620; markedPaidById indexado no banco — **DB-008**).
- **ReferralMonthlyCommission** — OK (FKs referrerTenantId/payoutId indexados; `@@unique([referrerTenantId,period])` idempotente; cascade/SetNull corretos).
- **CertificateTemplate** — OK (partial-unique singleton PMB em 20260620 — DB-004 FECHADO).
- **Certificate** — **DB-001** (PII; pdfUrl público persistido) + courseId indexado (certificates_course_id_idx) OK.
- **BannerSlide / HomeSection** — OK.
- **StudentLead / StudentLeadActivity** — OK (courseId/enrollmentId/visitorId indexados; leadId cascade).
- **VisitorEvent** — OK (courseId indexado via 20260620; retenção via sweep-visitor-events).
- **AutomationMessageTemplate** — OK (partial-unique PMB em 20260620 — DB-004 FECHADO).
- **AuditLog** — OK (sem FK por design forense; 5 índices).
- **TrainingModule / TrainingVideo** — OK (default published=true desde 20260625).
- **TrainingProgress** — OK (videoId indexado via 20260620).

### Migrations (75/75)
- Init + 74 incrementais. As 8 novas desde 2026-06-20 (20260621→20260628) verificadas:
  - `20260621_commission_rules` / `20260622_commission_plan_phases` — aditivas, enums via guarda `pg_type`, FKs com cascade/SetNull corretos, backfill idempotente, clamp `referral_payout_day<=20` — **OK**.
  - `20260623_course_packages` — tabelas + FKs guardadas por `pg_constraint`, índices completos, backfill de home_sections idempotente (guarda por `id='pmb-packages'`) — **OK**.
  - `20260624_course_packages_pmb_null_unique` — corrige ordenação do índice parcial PMB de course_packages (movido da 20260620 que ordenava antes da tabela existir); guarda `to_regclass` + `DO/EXCEPTION` — **OK** (DB-004 follow-up bem feito).
  - `20260625_tenant_can_sell_resellers` / `20260625_treinamentos_publicar_modulos` — aditivas/backfill idempotente (SET DEFAULT + UPDATE) — **OK**.
  - `20260626_email_log` — cria `email_logs` + 3 índices, idempotente — **OK** (ressalva retenção: DB-006).
  - `20260627_lms_credentials` — 5 ADD COLUMN IF NOT EXISTS em enrollments — **OK**.
  - `20260628_lms_webhook_receiver` — `ALTER TYPE WebhookSource ADD VALUE 'LMS'` + `CREATE UNIQUE INDEX` no MESMO arquivo (1 transação). Funciona (valor não usado na txn), mas materializa a fragilidade — **DB-005**.
- Nenhuma migração destrutiva nas 8 novas (0 DROP TABLE/COLUMN, 0 TRUNCATE, 0 ALTER COLUMN TYPE de coluna).
- `20260414_expand_roles` (histórica, pré-runner) faz enum swap (`DROP TYPE "UserRole"`) + `ALTER COLUMN TYPE` — NÃO idempotente, mas roda em ordem num cutover fresh (init cria `UserRole('SUPER_ADMIN','ADMIN','RESELLER')` antes) e é bootstrapada em bancos existentes — risco baixo aceito.
- `app_internal.run_cron` SECURITY DEFINER com `SET search_path TO ''` + nomes qualificados (20260610) — **OK** (§2 da referência).
- Reversibilidade (down): ausente (Prisma forward-only + runner próprio) — risco aceito pelo modelo do projeto.

### Outros itens
- **scripts/apply-pending-migrations.mjs** — tracking `_pmb_applied_migrations`, advisory lock não-bloqueante (90s), conexão DIRETA, distingue banco vazio (aplica tudo) de existente (bootstrap). Bom desenho. Ressalva **DB-005** (transação por arquivo).
- **prisma/seed.ts** — idempotente (upsert + findFirst+create p/ NULL composites) — OK.
- **src/lib/prisma.ts** — Pool `pg` + PrismaPg — ressalva pooling **DB-003**.
- **src/lib/pmb-tenant.ts** — `getOrCreatePmbTenant` agora captura P2002 e re-busca o vencedor (race-safe) — **DB-005 anterior (2026-06-20) FECHADO**.
- **prisma/sql/pg_cron_jobs.sql** — 13 jobs versionados idempotentes por jobname. `resync-lms-credentials`, `resync-platform-passwords`, `sync-lms-branding` NÃO agendados (on-demand por decisão do dono — ver memória). `email_logs` sem job — **DB-006**.
- **Storage** — `certificates` (público, read path já via signed/stream — **DB-001**), `vitrine-assets` (público; só assets de marketing, sem PII — OK), `payout-proofs` (privado dedicado, leitura autenticada — **comprovantes de saque do DB-001 anterior FECHADOS**), validação MIME por magic bytes + limite de tamanho — OK. **⚠️MIGRAÇÃO MinIO:** portar paths/ACLs, recriar bucket privado + signed URL no SDK S3.
- **Webhook receiver LMS** (api/webhooks/lms/route.ts) — HMAC antes de efeito, idempotência por `external_event_id` unique com tratamento de P2002 (race-safe) — OK (cruzar `api`/`seguranca`).
- **$queryRawUnsafe** (admin/analytics:35,56, admin/dashboard:530, painel/dashboard:150) — strings estáticas com binding posicional (`$1..$4`); `cfg.bucket` é valor controlado de servidor; painel é tenant-scoped (`$2 = ctx.tenantId`). Sem SQLi — OK.
- **Tenant scoping** (lib/tenant/current.ts, rotas amostradas loja/painel) — filtram por tenantId; sem rede de segurança no banco — **DB-002**.
- **⚠️MIGRAÇÃO Redis** — proxy resolve tenant via `@upstash/redis` (REST, funciona no Edge); o REST client NÃO fala Redis TCP no VPS — trocar por `ioredis`/`redis` (cache de tenant do proxy + ratelimit dependem disso). Cruza com `performance`/`devops`.
