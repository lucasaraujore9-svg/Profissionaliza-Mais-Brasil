# Auditoria 03 — Supabase / PostgreSQL / RLS / Storage

> Agente: Especialista em Supabase, PostgreSQL, RLS e Storage
> Escopo: schema Prisma (31 models), 31 migrations SQL, conexão Prisma/pg,
> Supabase Storage (buckets `vitrine-assets` e `certificates`), uso de anon key
> no client, RPC/triggers/security-definer, e filtros de tenant na aplicação.
> Modo: READ-ONLY. Nenhuma migração foi aplicada. Cito `arquivo:linha`.

---

## Resumo executivo

O **FATO CRÍTICO #1 do briefing está CONFIRMADO**: `src/lib/prisma.ts:15-21` cria
um `pg.Pool` com `DATABASE_URL` (usuário `postgres`, dono das tabelas no Supabase).
Prisma se conecta como **owner do banco** ⇒ **RLS do Postgres NÃO é aplicado**
(o owner faz BYPASSRLS por padrão, exceto em tabelas com `FORCE ROW LEVEL SECURITY`,
que não existe em nenhuma migration). A única policy existente
(`20260430_notification_preferences/migration.sql:19-23`) só nega o role `anon` —
**inócua para o app**, que nunca usa anon.

Conclusão: **todo o controle de acesso multi-tenant é 100% código de aplicação**
(guards + `where tenantId`). Não existe rede de segurança no banco.

A boa notícia: a amostragem de rotas mostrou que o tenant é derivado da **sessão**
(`requireResellerSession` → `session.user.tenantId`) ou de header `x-tenant-id`
**sanitizado pelo proxy** — não do body/query do cliente nas rotas de tenant.
A má notícia: o bucket `certificates` é **público** e guarda PDFs com **CPF**,
acessíveis por código de validação previsível; e não há defesa-em-profundidade no
banco caso uma única rota futura esqueça o filtro.

### Achados por severidade
- **Crítico:** 1 (PII em bucket público de certificados)
- **Alto:** 2 (ausência total de RLS como defesa-em-profundidade; bucket público
  sem policy serve qualquer asset/PII via service-role + URL pública)
- **Médio:** 4 (campos nullable de isolamento — `tenantId` nullable em 6 models;
  FKs sem `onDelete` explícito → restrict implícito pode travar deleção de tenant;
  `Enrollment.tenantId` órfão possível; bootstrap de migrations marca tudo aplicado sem rodar)
- **Baixo:** 3 (índices, idempotência parcial, `mustChangePassword`/tokens sem TTL no banco)
- **Informativo:** 3

---

## Confirmado vs. hipótese

**CONFIRMADO (evidência direta no código):**
- Prisma conecta como owner ⇒ RLS bypassed (`src/lib/prisma.ts:15-21`).
- Única policy é só-anon e inócua (`20260430_notification_preferences/migration.sql:19-23`).
- Nenhum `CREATE FUNCTION/TRIGGER/SECURITY DEFINER/RPC` em `prisma/` (grep vazio).
- Nenhuma anon key usada no client — só declarada no schema de env (`src/lib/env.ts:99,102`), nunca passada a `createClient` (não há `@supabase/supabase-js` instanciado em lugar nenhum).
- Storage usa SEMPRE `SUPABASE_SERVICE_ROLE_KEY` server-side (`src/lib/supabase/storage.ts:5`, `src/lib/certificates/storage.ts:5`).
- Buckets `vitrine-assets` e `certificates` são acessados via rota `/object/public/<bucket>/` ⇒ **públicos** (`storage.ts:70`, `certificates/storage.ts:84`).
- Path do certificado = `{tenantId ?? "pmb"}/{code}.pdf` e `code` é o mesmo código exposto na página pública `/validar/{code}` (`src/lib/certificates/generate-pdf.ts:40`, `src/app/validar/[code]/page.tsx:461`).
- Proxy **strip** `x-tenant-id`/`x-tenant-slug` do cliente e só re-injeta após resolver tenant (`src/proxy.ts:181-183`, `258-262`). Rotas de loja confiam nesse header (`/api/loja/checkout/route.ts:59`).
- Uploads validam MIME allowlist + magic bytes + 5MB e derivam path do `ctx.tenantId` da sessão (`/api/painel/vitrine/upload/route.ts:69-108`, `/api/painel/banner/upload/route.ts:62-96`).

**HIPÓTESE / requer verificação no painel Supabase (não auditável só por código):**
- Se os buckets têm `public = true` no dashboard (o uso da URL `/object/public/` sugere que sim, mas a flag real está no Supabase, não no repo).
- Se existe alguma RLS/policy criada manualmente no Storage `storage.objects` fora das migrations (não há nada no repo; provavelmente default).
- Se o role da `DATABASE_URL` é literalmente `postgres` ou um role com `BYPASSRLS` (o `.env` é gitignored; o briefing afirma `postgres`; comportamento é idêntico de qualquer forma se for owner).

---

## Achados detalhados

### [Crítico] PDFs de certificado com CPF em bucket público acessíveis por código de validação
- Agente responsável: Supabase/RLS/Storage
- Categoria: Exposição de PII / Storage público
- Arquivo: `src/lib/certificates/generate-pdf.ts:40,105-106`; `src/lib/certificates/storage.ts:1,84`; `src/app/validar/[code]/page.tsx:459-461`
- Linha/trecho: `pdfPathFor = `${tenantId ?? "pmb"}/${code}.pdf``; `certificatePublicUrl → /storage/v1/object/public/certificates/<path>`; `<a href={cert.pdfUrl}>` na página pública.
- Evidência: bucket `certificates` é servido via rota `/public/`; o PDF contém `studentCpf` (snapshot, `schema.prisma:1206`); o `code` é o código curto público de validação (`schema.prisma:1190`, exibido em `/validar/{code}`).
- Descrição: Qualquer pessoa que conheça (ou enumere) um `code` consegue baixar o PDF com nome completo + CPF diretamente do Storage, sem autenticação. A rota autenticada `student/.../download` faz stream privado (`download/route.ts:69-94`), mas a URL pública continua válida e é linkada na página de validação.
- Impacto: Vazamento de dado pessoal sensível (CPF) — violação de LGPD. Enumeração de códigos amplia o vazamento em massa.
- Cenário de risco: Atacante coleta/gera `code`s e raspa CPFs de todos os formandos.
- Recomendação: Tornar o bucket `certificates` **privado**; servir PDFs só via rota autenticada com signed URL de curta duração; na página `/validar` não expor a URL pública do Storage (gerar signed URL on-demand ou renderizar via rota proxy). Avaliar `certificateRequireCpf`/omitir CPF do PDF público.
- Correção aplicada: Nenhuma (READ-ONLY).
- Status: Requer decisão humana
- Confiança: Alta (código) / Média (depende de a flag `public` do bucket estar ligada — provável)

---

### [Alto] RLS efetivamente ausente — sem defesa-em-profundidade no banco
- Agente responsável: Supabase/RLS
- Categoria: Defesa-em-profundidade / Multi-tenant
- Arquivo: `src/lib/prisma.ts:15-21`; `prisma/migrations/20260430_notification_preferences/migration.sql:19-23`
- Evidência: Pool conecta com `DATABASE_URL` (owner). Única policy nega só `anon`. Nenhuma tabela tem `FORCE ROW LEVEL SECURITY`. 30/31 migrations não tocam RLS.
- Descrição: O owner ignora RLS. Mesmo se policies por-tenant existissem, não seriam aplicadas nessa conexão. O isolamento depende inteiramente de cada uma das ~200 rotas lembrar do `where tenantId`.
- Impacto: Um único route handler sem filtro = vazamento cross-tenant direto, sem mitigação no banco.
- Cenário de risco: PR futuro adiciona `prisma.student.findMany()` sem filtro → expõe alunos de todos os tenants.
- Recomendação: (defesa-em-profundidade) criar um role de aplicação **NOSUPERUSER NOBYPASSRLS** distinto do owner, `ENABLE`+`FORCE ROW LEVEL SECURITY` nas tabelas com `tenant_id`, e usar `SET app.tenant_id` por transação (via Prisma middleware/`$transaction`). Alto custo de implementação; priorizar a curto prazo um lint/teste que falhe quando uma query em tabela tenant-scoped não tem filtro.
- Correção aplicada: Nenhuma.
- Status: Recomendado / Requer decisão humana
- Confiança: Alta

---

### [Alto] Service-role + buckets públicos: sem isolamento de tenant no Storage
- Agente responsável: Storage
- Categoria: Storage / Multi-tenant
- Arquivo: `src/lib/supabase/storage.ts:38-66,73-86`; `src/app/api/painel/vitrine/upload/route.ts:97`
- Evidência: Todo acesso usa service-role (bypassa policies de Storage). Bucket `vitrine-assets` é público. Path = `{tenantId}/...` derivado da sessão (bom), mas a leitura pública não distingue tenant.
- Descrição: O isolamento de upload é só pelo path session-derived (não há path traversal: `kind`/`slot`/`Date.now()` são constrained e `tenantId` vem da sessão — confirmado em `vitrine/upload/route.ts:97`, `banner/upload/route.ts:96`, `cursos/[id]/capa/route.ts:84`). Porém, como tudo é público + service-role, qualquer asset de qualquer tenant é legível por URL e não há policy no Storage como rede de segurança. Para `vitrine-assets` (logos/banners de marketing) o risco é baixo; o problema sério é o bucket `certificates` (ver Crítico acima).
- Impacto: Sem confidencialidade de assets; nenhuma camada de policy no Storage.
- Cenário de risco: Vide Crítico (certificates). Para vitrine-assets, baixo.
- Recomendação: Manter `vitrine-assets` público (são assets de marketing) mas separar `certificates` em bucket privado com signed URLs. Documentar explicitamente as policies do Storage no repo (hoje invisíveis).
- Correção aplicada: Nenhuma.
- Status: Parcialmente recomendado
- Confiança: Alta (código) / Média (flag pública do bucket)

---

### [Médio] `tenantId` nullable em 6 models — risco de órfão e ambiguidade PMB vs. vazamento
- Agente responsável: Schema/RLS
- Categoria: Modelagem / Multi-tenant
- Arquivo: `schema.prisma` — `Enrollment.tenantId?` (:564), `Payment.tenantId?` (:648), `Coupon.tenantId?` (:694), `WebhookLog.tenantId?` (:779), `Certificate.tenantId?` (:1200), `StudentLead.tenantId?` (:1318), `Lead.tenantId?` (:860), `BannerSlide/HomeSection/CertificateTemplate/AutomationMessageTemplate tenantId?`
- Evidência: `tenantId = null` é semanticamente "vitrine PMB" (institucional). Não há CHECK que garanta consistência (ex.: `Enrollment.tenantId` null mas `tenantCourseId` setado, ou vice-versa).
- Descrição: Como `null` é um valor legítimo, uma query `where: { tenantId }` com `tenantId` vindo `undefined`/`null` por bug pode listar **todos os registros PMB** ou casar com o conjunto errado. Também não há constraint relacionando `Enrollment.tenantId` com `Student.tenantId` (Student.tenantId é NOT NULL, :490) — em teoria uma enrollment pode referenciar student de outro tenant.
- Impacto: Vazamento cross-tenant por engano de filtro; registros inconsistentes (enrollment PMB com tenantCourse de revenda).
- Cenário de risco: Helper passa `tenantId: session?.user?.tenantId` (undefined p/ admin) a uma query loja → Prisma traduz `undefined` ignorando o filtro.
- Recomendação: Em queries tenant-scoped, nunca passar `tenantId` possivelmente `undefined` (validar antes). Adicionar CHECK/teste garantindo que `Enrollment.studentId` pertença ao mesmo `tenantId`. Considerar coluna sentinela (tenant placeholder `__pmb__`) em vez de NULL — já existe `pmb-tenant.ts`, mas o schema ainda usa NULL nesses models.
- Correção aplicada: Nenhuma.
- Status: Recomendado
- Confiança: Média (hipótese de exploração; modelagem confirmada)

---

### [Médio] FKs de Tenant sem `onDelete` explícito → DELETE de tenant pode falhar/orfanizar
- Agente responsável: Schema
- Categoria: Integridade referencial
- Arquivo: `schema.prisma` — `Enrollment.tenant` (:565, sem onDelete), `Payment.tenant` (:649), `WebhookLog.tenant` (:780), `Lead.tenant` (:861), `Certificate.tenant` (:1201), `Course.category` (:365)
- Evidência: Vários relacionamentos opcionais para `Tenant` não declaram `onDelete`. Default do Prisma para relação opcional é `SetNull`; para obrigatória é `Restrict`. Muitos outros usam `onDelete: Cascade` explicitamente (ex.: `Student.tenant` :491, `TenantCourse` :455).
- Descrição: Mistura de `Cascade` (Student, TenantCourse, Coupon, etc.) com `SetNull` implícito (Enrollment, Payment, Certificate). Ao deletar um tenant: Students cascateiam (e Enrollments cascateiam via Student), mas Payments/Certificates teriam `tenant_id` setado a NULL — virando "registros PMB" indistinguíveis dos legítimos. Pior: relatórios financeiros PMB passariam a somar pagamentos de um tenant deletado.
- Impacto: Corrupção silenciosa de contabilidade PMB; registros reclassificados como institucionais.
- Cenário de risco: Admin deleta tenant inadimplente → Payments daquele tenant viram receita PMB.
- Recomendação: Definir `onDelete` explícito e coerente em TODAS as FKs de Tenant. Para dados financeiros, preferir `Restrict` (proibir delete com pagamentos) ou soft-delete de tenant (não há campo `deletedAt`).
- Correção aplicada: Nenhuma.
- Status: Recomendado
- Confiança: Alta (modelagem) / Média (impacto depende de fluxo de delete existir)

---

### [Médio] Bootstrap de migrations marca tudo como "aplicado" sem rodar — drift silencioso
- Agente responsável: Migrations/Deploy
- Categoria: Migrations / CI
- Arquivo: `scripts/apply-pending-migrations.mjs:103-117,166-177`
- Evidência: Na primeira execução, se a tabela `_pmb_applied_migrations` está vazia, o script **marca todas as 31 migrations como aplicadas sem executá-las**, assumindo que o prod já está sincronizado.
- Descrição: Em qualquer ambiente novo (staging/clone/disaster-recovery) onde o schema NÃO esteja pré-criado, o bootstrap vai marcar tudo como aplicado e o banco ficará **vazio/incompleto** silenciosamente. Não há validação de que o schema realmente exista.
- Impacto: Banco de réplica/DR sem tabelas, mas "migrations OK" — falha tardia e confusa.
- Cenário de risco: Provisionar segundo ambiente Supabase → app sobe sem tabelas.
- Recomendação: No bootstrap, verificar a existência de uma tabela-âncora (ex.: `users`) antes de marcar como aplicado; se ausente, **rodar** as migrations em vez de pular. Adotar `prisma migrate deploy` quando compatível.
- Correção aplicada: Nenhuma.
- Status: Recomendado
- Confiança: Alta

---

### [Médio] Migrations só parcialmente idempotentes — `apply` executa SQL bruto em transação
- Agente responsável: Migrations
- Categoria: Migrations
- Arquivo: `scripts/apply-pending-migrations.mjs:135-154`; `prisma/migrations/20260524_composite_indexes/migration.sql` (idempotente, OK)
- Evidência: O script roda `client.query(file.content)` inteiro numa transação. `20260524_composite_indexes` usa `CREATE INDEX IF NOT EXISTS` (bom). Não confirmei que TODAS as 31 sejam idempotentes; o comentário do script exige idempotência mas não a verifica. Re-execução com hash diferente apenas faz WARN e NÃO re-aplica (:126-132) — uma edição pós-aplicação de migration nunca chega ao banco.
- Descrição: Migrations não-idempotentes que rodem 2x (se a tabela de tracking cair) quebram; e edições em migration já aplicada são ignoradas (hash diverge → WARN, skip).
- Impacto: Drift entre repo e banco; risco em recuperação de tracking table.
- Recomendação: Garantir `IF NOT EXISTS`/`DO $$` em todas; nunca editar migration aplicada (criar nova). Considerar `CREATE INDEX CONCURRENTLY` fora de transação para tabelas grandes (hoje rodaria dentro de BEGIN e falharia).
- Correção aplicada: Nenhuma.
- Status: Recomendado
- Confiança: Média

---

### [Baixo] Índices: cobertura boa, algumas lacunas
- Agente responsável: Schema/Performance
- Categoria: Performance / Índices
- Arquivo: `schema.prisma` (vários `@@index`); `20260524_composite_indexes/migration.sql`
- Evidência: Composite indexes hot existem: `enrollments(tenant_id,status)`, `payments(tenant_id,created_at|paid_at)`, `tenant_payments(tenant_id,status,due_date)`. `Coupon` tem unique `(tenantId,code)` (:720) — bom para o lookup do checkout (`loja/checkout/route.ts:171-179`). `Student` tem `(tenantId,email)`/`(tenantId,cpf)` unique (:549-550).
- Descrição: Lacunas menores: `Certificate.code` tem index e unique (:1190,1231) OK; `Enrollment` lookup por `(studentId,courseId,tenantId,status)` no checkout (`loja/checkout/route.ts:243-251`) não tem composite dedicado (usa `studentId` index + filtro). `Course.slug`/`nome` unique OK. Volume provavelmente baixo; não crítico.
- Impacto: Scans um pouco maiores em checkouts de alta cardinalidade.
- Recomendação: Opcional — `@@index([studentId, courseId, tenantId])` em Enrollment se o volume crescer.
- Status: Informativo/Baixo
- Confiança: Média

---

### [Baixo] Tokens de reset sem expiração garantida por banco
- Agente responsável: Schema
- Categoria: Modelagem / Segurança
- Arquivo: `schema.prisma` `User.resetToken`/`resetTokenExpires` (:139-140), `Student.resetToken`/`resetTokenExpires` (:537-538)
- Evidência: Expiração é só um campo `DateTime?` validado em código (não há constraint nem job de limpeza visível no schema).
- Descrição: Tokens vencidos persistem na tabela; depende do app comparar `expires`. Sem TTL no banco.
- Recomendação: Garantir verificação de `resetTokenExpires` em toda validação (auditar no agente de Auth) e limpar tokens vencidos periodicamente.
- Status: Baixo
- Confiança: Média

---

### [Informativo] Filtros de tenant na aplicação — amostragem POSITIVA
- Agente responsável: Supabase/RLS (validação cruzada)
- Arquivo: `src/app/api/painel/**` (60 rotas; 56 referenciam guard/sessão), `src/app/api/loja/**`, `src/proxy.ts:181-183`
- Evidência:
  - Painel: `tenantId` vem de `requireResellerSession()` → `session.user.tenantId` (`reseller-session.ts:8-17`), nunca do body. Acesso a recursos por id sempre via `findFirst({ where: { id, tenantId } })` (ex.: `painel/banner/[id]/route.ts:27-32`, `painel/cursos/[id]/capa/route.ts:35-40`).
  - Loja (público): `tenantId` vem de `x-tenant-id` **sanitizado** pelo proxy (`proxy.ts:181-183,258-262`); cliente não consegue forjar. Checkout filtra `tenantCourse.findFirst({ id, tenantId, isVisible:true })` e `coupon.findFirst({ tenantId, code })` (`loja/checkout/route.ts:115-128,171-179`).
  - Admin: rotas que leem `tenantId` de query/body são SUPER_ADMIN/admin-scoped e validam ownership para PMB_RESELLER_MGR (`admin/relatorios/[type]/route.ts:17-50`).
  - 2 rotas painel sem guard são **endpoints descontinuados (HTTP 410)**: `painel/certificate-template/upload`, `painel/referrals/request-payout`.
- Descrição: Não encontrei rota de tenant que confie em `tenantId` vindo do cliente. A superfície é ampla (200 rotas) e só amostrei; recomendo varredura exaustiva pelo agente de Auth/API.
- Status: Não reproduzido (nenhum vazamento confirmado na amostra)
- Confiança: Média (amostragem, não exaustivo)

---

### [Informativo] Nenhuma function/trigger/security-definer/RPC no repo
- Evidência: grep `create function|create trigger|security definer|rpc` em `prisma/` → vazio. Toda lógica é no app. Não há superfície de SQL injection via RPC nem privilégio elevado por security-definer.
- Status: Informativo / Confiança: Alta

### [Informativo] Anon key nunca usada para criar client Supabase
- Evidência: `SUPABASE_ANON_KEY`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` só aparecem no schema de env (`env.ts:99,102`); não há `createClient(...)` em nenhum componente client. Browser não acessa Postgres/Storage diretamente — todo acesso é server-side com service-role. (Bom: anon key não vaza acesso.)
- Status: Informativo / Confiança: Alta

---

## Tabela obrigatória

| Recurso | Tipo | Problema | Severidade | Risco | SQL sugerido | Status |
|---|---|---|---|---|---|---|
| Bucket `certificates` | Storage público | PDFs com CPF acessíveis por `code` em URL pública (`/validar`) | Crítico | Vazamento PII / LGPD | (c) tornar bucket privado via dashboard + signed URLs (não é SQL de migration) | Requer decisão humana |
| Conexão Prisma (owner) | RLS | Owner bypassa RLS; sem rede de segurança no banco | Alto | Vazamento cross-tenant se 1 query esquecer filtro | (b) criar role app NOBYPASSRLS + `ENABLE`/`FORCE RLS` + policies por `tenant_id` | Recomendado |
| Storage (service-role) | Storage | Tudo via service-role + buckets públicos, sem policy | Alto | Confidencialidade nula de assets | (b) policies em `storage.objects`; separar `certificates` privado | Parcialmente |
| `Enrollment/Payment/Certificate.tenantId` | Schema | `null` legítimo + sem CHECK de coerência student↔tenant | Médio | Vazamento por filtro `undefined`; órfão | (b) `ALTER TABLE enrollments ADD CONSTRAINT ... CHECK`/trigger de coerência | Recomendado |
| FKs `Tenant` (Payment/Certificate/...) | Schema | `onDelete` implícito (`SetNull`) reclassifica dados como PMB | Médio | Corrupção contábil ao deletar tenant | (b) `ALTER TABLE ... DROP CONSTRAINT ... ADD ... ON DELETE RESTRICT` | Recomendado |
| `apply-pending-migrations.mjs` bootstrap | Migrations | Marca tudo aplicado sem rodar em ambiente novo | Médio | DB vazio "OK" em DR/staging | (a) checar existência de tabela-âncora antes do bootstrap (código, não SQL) | Recomendado |
| Migrations idempotência | Migrations | Edição pós-aplicação ignorada; nem todas idempotentes | Médio | Drift repo↔DB | (a) padronizar `IF NOT EXISTS`/`DO $$`; nunca editar migration aplicada | Recomendado |
| Enrollment lookup checkout | Índices | Falta composite `(studentId,courseId,tenantId)` | Baixo | Scan maior em volume alto | (a) `CREATE INDEX IF NOT EXISTS enrollments_student_course_tenant_idx ON enrollments(student_id,course_id,tenant_id);` | Recomendado |
| Tokens reset | Schema | Sem TTL no banco; depende do app | Baixo | Token vencido persistente | (a) job de limpeza periódico (não bloqueante) | Recomendado |

### Classificação do SQL sugerido

**(a) Seguro / recomendado (idempotente, não destrutivo):**
```sql
-- Índice composto para o lookup de enrollment no checkout (loja/checkout/route.ts:243-251)
CREATE INDEX IF NOT EXISTS "enrollments_student_course_tenant_idx"
  ON "enrollments" ("student_id", "course_id", "tenant_id");

-- Limpeza periódica de tokens de reset vencidos (rodar como job/cron, não migration)
-- DELETE é restrito a linhas já inúteis; ainda assim, revisar antes de agendar.
-- UPDATE "users" SET reset_token = NULL, reset_token_expires = NULL
--   WHERE reset_token_expires < NOW();
```

**(b) Requer revisão humana (mudança estrutural / RLS — alto impacto):**
```sql
-- DEFESA-EM-PROFUNDIDADE (RLS): exige criar role de app dedicado e alterar
-- a connection string. NÃO aplicar sem reescrever a camada de conexão para
-- setar app.tenant_id por transação. Esboço:
-- CREATE ROLE pmb_app LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '...';
-- GRANT ... ; ALTER TABLE students ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE students FORCE ROW LEVEL SECURITY;
-- CREATE POLICY tenant_isolation ON students
--   USING (tenant_id = current_setting('app.tenant_id', true));

-- Coerência student↔tenant em enrollments (revisar dados antes; pode falhar
-- se já existir inconsistência):
-- ALTER TABLE enrollments ADD CONSTRAINT enrollment_student_same_tenant ...
--   (requer trigger pois CHECK não enxerga outra tabela).
```

**(c) Potencialmente destrutivo — NÃO aplicar:**
```sql
-- NÃO RODAR: trocar onDelete para RESTRICT/CASCADE altera comportamento de
-- deleção e pode travar fluxos existentes; e tornar bucket privado é ação de
-- dashboard, não SQL. Qualquer DROP/ALTER de FK deve passar por revisão +
-- backup. Exemplo do que NÃO aplicar cegamente:
-- ALTER TABLE payments DROP CONSTRAINT payments_tenant_id_fkey,
--   ADD CONSTRAINT payments_tenant_id_fkey FOREIGN KEY (tenant_id)
--   REFERENCES tenants(id) ON DELETE RESTRICT;
```

---

## Nota final
Nenhuma migração foi aplicada (READ-ONLY). O achado **Crítico** (certificados com CPF
em bucket público) é resolvível por configuração de dashboard + ajuste de código, e
deve ser priorizado por LGPD. A ausência de RLS é um risco estrutural aceito hoje;
mitigá-la no banco é caro — a recomendação de curto prazo é um teste/lint que falhe
quando uma query em tabela tenant-scoped não filtra por `tenant_id`.
