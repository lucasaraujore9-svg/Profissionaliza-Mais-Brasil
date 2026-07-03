# Auditoria — SaaS / Produto (multi-tenancy, billing, audit trail)
_Data: 2026-07-03 · Referência: .claude/skills/auditoria-saas/references/09-saas-produto.md · Itens do inventário cobertos: ver seção Cobertura_

## Resumo
- Itens verificados: tenant resolver + proxy, isolamento financeiro (4 direções × 2 gateways) pós-blindagem do **P0 de gateway collapse** (8541afd/9a6adf9), billing Asaas (webhook PMB + por-tenant + dunning/lifecycle), fulfillment EA/LMS, motor de comissão (legado + MONTHLY_TIERED) + payout/clawback, feature gating (automationEnabled), gates de catálogo (COURSE_HAS_PRICE + status=ATIVO ec832d0 + curadoria-não-revertida 45d8af6), onboarding/criação de revenda + sub-revendas, pacotes, **venda direta no painel do revendedor** (`painel/vendas` — novo na cobertura), fluxo de domínio próprio gate-por-DNS (a42ccb8), webhook LMS (HMAC + idempotente + catálogo course.updated), audit trail (AuditLog).
- Achados: **P0=0 · P1=0 · P2=2 · P3=4** (originais 2026-07-03). **Após rodada de correção 2026-07-03:** Corrigidos SAAS-001, SAAS-006, SAAS-008, SAAS-009, SAAS-010; **Aberto** apenas SAAS-007 (P3, correção fail-closed conflita com decisão de resiliência fail-open vigente — ver nota no achado; requer decisão do dono, não forçado).
- Nota do domínio: **8.5/10** (mantida; o P0 de colapso de gateway foi **blindado** com identificação positiva por `Student.tenantId` + asserts de defesa-em-profundidade no "hop do dinheiro" + testes, sem regressão; delta de catálogo/domínio/LMS bem construído; restam 2 P2 (audit trail secundário + imutabilidade) e 4 P3).

> **Re-verificação vs. 2026-06-24:** os 5 achados abertos anteriores continuam **ABERTOS** e foram re-confirmados no código atual (line numbers atualizados): **SAAS-001** (P2, audit trail em rotas secundárias — `grep -c logAudit` = 0 nas 15 rotas), **SAAS-006** (P2, imutabilidade do `audit_logs` — nenhuma migration com trigger/REVOKE), **SAAS-007** (P3, proxy em falha transitória — `src/proxy.ts:333-367`), **SAAS-008** (P3, webhook LMS `course.completed` sem retry — `lms-process.ts:110,133` + `route.ts:106-118`), **SAAS-009** (P3, sub-revenda expõe `invoiceUrl`/`bankSlipUrl` — `revendas/[id]/page.tsx:97-98`). **SAAS-002/003/004/005** seguem **CORRIGIDOS** (confirmados em rodadas anteriores). **Delta re-auditado**: o **P0 de gateway collapse** (colapso de venda de revenda para a conta-mãe da PMB) foi corrigido em 8541afd e **verificado sem regressão** — roteamento por `Student.tenantId` autoritativo (`aluno/comprar/route.ts:363-379`), `motherAsaasKey()` explícito (lança se `ASAAS_API_KEY` ausente), `assertPmbCharge`/`assertCouponMatchesEnrollment` wired em TODAS as rotas de checkout/venda. Novo achado apenas **SAAS-010** (P3, `painel/vendas` não aplica o gate `status=ATIVO` do ec832d0).

---

## Achados

### [SAAS-001] Audit trail ausente em operações sensíveis secundárias (consultor/maxDiscount, status manual do tenant, cupons, conexão de gateway, exportações, comissão/mensalidade)
- **Severidade:** P2
- **Status:** Corrigido (2026-07-03 — 4 commits atômicos: bad0a22 admin de tenant, cba66e1 cupons, ed416a4 equipe+gateways, 184abc6 exports)
- **Local:**
  - `src/app/api/painel/equipe/[id]/route.ts` (PATCH muda `maxDiscount` — cap de desconto do consultor, uma autoridade comercial — e DELETE desativa membro; sem `logAudit`)
  - `src/app/api/admin/revendedores/[id]/status/route.ts` (PATCH transição manual de lifecycle ACTIVE/SUSPENDED/PENDING/CANCELLED do tenant; sem `logAudit`)
  - `src/app/api/admin/tenants/[id]/mensalidade/route.ts` (PUT muda capability de parcelamento; sem `logAudit`)
  - `src/app/api/admin/tenants/[id]/referral-percent/route.ts`, `.../revendedores/[id]/sales/route.ts`, `.../revendedores/[id]/manager/route.ts`, `.../revendedores/[id]/password/route.ts` (mudança de % de comissão, vínculo de vendedor/gerente e reset de senha do revendedor; sem `logAudit`)
  - `src/app/api/admin/cupons/route.ts` (POST) + `src/app/api/admin/cupons/[id]/toggle/route.ts` + `src/app/api/painel/cupons/route.ts` (CRUD/toggle de cupom; sem `logAudit`)
  - `src/app/api/painel/config/connect-mp/route.ts` e `connect-asaas/route.ts` (POST/DELETE conecta/desconecta gateway de cobrança do tenant — credencial sensível; sem `logAudit`)
  - `src/app/api/painel/financeiro/export-csv/route.ts`, `src/app/api/admin/referrals/commissions/export/route.ts`, `src/app/api/admin/referrals/payouts/export/route.ts`, `src/app/api/admin/revendedores/[id]/comissoes/export/route.ts` (exportação de dados financeiros; sem `logAudit`)
- **Evidência:** `grep -c logAudit` nessas rotas retorna **0** (verificado 2026-07-03, todas as 15). A referência (item 4) lista explicitamente como obrigatório auditar: exclusão de registros, **mudança de permissão/papel**, **alteração de billing** e **exportação de dados**. Os caminhos de MAIOR risco já foram cobertos em rodadas anteriores (billing PATCH em `revendedores/[id]/billing/route.ts`, cancelamento em `revendedores/[id]/route.ts`, criação em `lib/resellers/create.ts`, papel/desativação em `equipe/[id]/route.ts`, impersonate). Restam os secundários acima — `maxDiscount` (autoridade de desconto), transição manual de status do tenant, conexão de gateway e exports.
- **Impacto:** Sem trilha de "quem mudou o quê e quando" nesses caminhos, alterações como rebaixar/elevar o cap de desconto de um consultor, suspender/cancelar manualmente uma revenda, trocar o gateway de cobrança ou exportar a base financeira ficam irrastreáveis forensemente. Risco residual de conformidade (LGPD) e de investigação de incidente — menor que na rodada original, pois billing/permissão de papel já estão cobertos.
- **Correção:** Adicionar `logAudit(...)` (de `@/lib/audit`) ao final de cada mutação, espelhando o padrão já aplicado em `equipe/[id]/route.ts`:
  - `painel/equipe/[id]` PATCH: `action:"tenant_member.update"`, `resource:"TenantMember"`, `resourceId:id`, `tenantId`, `payloadBefore:{maxDiscount: member.maxDiscount, status: member.status}`, `payloadAfter: parsed.data`, `actorUserId`, `actorRole`; DELETE: `action:"tenant_member.deactivate"`.
  - `revendedores/[id]/status` PATCH: `action:"tenant.status.update"`, `payloadBefore:{status:<antes>}`, `payloadAfter:{status: parsed.data.status}` (carregar status antigo no `select`).
  - `connect-mp`/`connect-asaas`: `action:"tenant.gateway.connect"`/`"...disconnect"`, `resource:"Tenant"`, **sem incluir token no payload**.
  - exports: `action:"data.export"`, `resource:"<commissions|payouts|financeiro>"`, `payloadAfter:{rows:<n>, filters:<safe>}`.
  - cupons/mensalidade/referral-percent/sales/manager/password: `action` análogo (`coupon.create`, `coupon.toggle`, `tenant.monthly.update`, `tenant.referral_percent.update`, `tenant.sales.update`, `tenant.manager.update`, `reseller.password.reset`).
- **Verificação:** Exercitar cada rota e conferir `SELECT action, resource, resource_id, actor_user_id FROM audit_logs ORDER BY created_at DESC LIMIT 20`. Teste unitário que mocka `logAudit` e afirma a chamada com o `action` esperado por rota.
- **Verificação (realizada 2026-07-03):** 4 novos test files provam o `action`/`resource` por rota, mockando `logAudit` (`src/app/api/admin/audit-saas001.test.ts` 6 casos, `.../admin/cupons/audit-saas001.test.ts` 3, `.../painel/audit-saas001.test.ts` 6, `.../admin/referrals/audit-saas001-export.test.ts` 4). Os testes de gateway/senha afirmam explicitamente que credencial/senha NÃO aparece no payload. Actions aplicados: `tenant.status.update`, `tenant.monthly.update`, `tenant.referral_percent.update`, `tenant.sales.update`, `tenant.manager.update`, `reseller.password.reset`, `coupon.create`, `coupon.toggle`, `tenant_member.update`, `tenant_member.deactivate`, `tenant.gateway.connect`/`disconnect`, `data.export`. Portão Zero-Erro verde nos 4 commits (449 testes).

### [SAAS-006] AuditLog não tem imutabilidade garantida em nível de banco (append-only)
- **Severidade:** P2
- **Status:** Corrigido (2026-07-03 — migration `prisma/migrations/20260703_audit_logs_immutable` com trigger append-only; defesa por TRIGGER, não REVOKE)
- **Local:** `prisma/migrations/20260528_audit_logs/migration.sql` (só cria a tabela + índices; sem REVOKE/trigger) · `prisma/schema.prisma` (model AuditLog) · `src/lib/audit.ts` (só faz `create`)
- **Evidência:** A referência (item 4) pede tabela de auditoria **imutável** (sem update/delete via app; append-only; acesso restrito). `grep -l "BEFORE UPDATE|BEFORE DELETE|append-only|REVOKE"` sobre as migrations que mencionam `audit_logs` **não retorna nada** (verificado 2026-07-03). O projeto não usa RLS (isolamento em código) e não há trigger/grant impedindo `UPDATE`/`DELETE` em `audit_logs`. O wrapper `logAudit` só faz `prisma.auditLog.create` (correto), mas qualquer código futuro com acesso ao client `prisma` (ou a `service_role` no Supabase) pode reescrever/apagar a trilha. Com a cobertura de auditoria crescendo (billing, cancelamento, papéis, impersonate), o valor probatório da tabela cresce.
- **Impacto:** Trilha forense pode ser adulterada por código futuro ou acesso direto ao banco — enfraquece exatamente o que a auditoria deveria garantir. Um ator com acesso ao banco pode billing-update + apagar o registro de auditoria correspondente sem deixar rastro.
- **Correção:** Em migration idempotente nova (o runner `scripts/apply-pending-migrations.mjs` exige idempotência), criar trigger `BEFORE UPDATE OR DELETE ON audit_logs` que faz `RAISE EXCEPTION 'audit_logs is append-only'`:
  ```sql
  CREATE OR REPLACE FUNCTION audit_logs_immutable() RETURNS trigger AS $$
  BEGIN RAISE EXCEPTION 'audit_logs is append-only'; END; $$ LANGUAGE plpgsql;
  DROP TRIGGER IF EXISTS audit_logs_no_mutation ON audit_logs;
  CREATE TRIGGER audit_logs_no_mutation BEFORE UPDATE OR DELETE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();
  ```
  ⚠️MIGRAÇÃO: o trigger é portável e roda igual no Postgres self-hosted do Swarm. Se quiser também REVOKE por role, documentar o role usado pela `DATABASE_URL` (Supavisor → pgBouncer na VPS).
- **Verificação:** `UPDATE audit_logs SET action='x' WHERE id=...` e `DELETE FROM audit_logs ...` com o role da app devem falhar; `INSERT` continua funcionando. Rodar `logAudit` em qualquer rota auditada e confirmar persistência.
- **Verificação (2026-07-03):** Migration idempotente criada (trigger `audit_logs_no_mutation` BEFORE UPDATE OR DELETE → `RAISE EXCEPTION` com ERRCODE `insufficient_privilege`; função `audit_logs_immutable()` via CREATE OR REPLACE; DROP TRIGGER IF EXISTS antes do CREATE). Defesa escolhida = **trigger**, não REVOKE (mexer nos grants do role do runtime poderia quebrar o app — fora do escopo). Confirmado por grep que NENHUM código faz UPDATE/DELETE em `auditLog`/`audit_logs` (só `create` via `logAudit`) → o trigger não quebra nenhum caminho existente. Portão Zero-Erro verde (SKIP_PENDING no build; sem DB local para shadow-lint). A aplicação real do trigger ocorre no próximo deploy (auto via `apply-pending-migrations.mjs`); verificação DB-level (UPDATE/DELETE falham, INSERT ok) fica **pendente de execução pós-deploy** pelo dono.

### [SAAS-010] Venda direta do revendedor (`painel/vendas`) não aplica o gate `status=ATIVO` — inconsistente com ec832d0
- **Severidade:** P3
- **Status:** Corrigido (2026-07-03 — commit abaixo)
- **Local:** `src/app/api/painel/vendas/route.ts:153-174` (POST) — a query do curso filtra `{ id: data.tenantCourseId, tenantId: tenant.id, isVisible: true }` e valida `basePrice > 0`, mas **não** valida `course.status === "ATIVO"`.
- **Evidência:** O commit ec832d0 estendeu o gate `status=ATIVO` a **todos** os caminhos de receita da vitrine (`loja/checkout`, `loja/checkout-inquiry`, `loja/cupom/validar`, `loja/leads`) para que um curso desativado/removido na origem (EA/LMS → `status="INATIVO"`) não pudesse ser comprado nem via POST direto. A rota `painel/vendas` (venda manual iniciada pelo próprio revendedor, com Payment Brick da conta MP do tenant) **não** recebeu esse gate: seleciona por `isVisible` mas ignora `course.status`. Como o sync preserva a curadoria de status do admin (45d8af6, `sync.ts:190`/`sync-lms.ts:195`), é possível ter `Course.status="INATIVO"` com `TenantCourse.isVisible=true` (visibilidade é flag independente controlada pelo revendedor) — logo o caminho é alcançável.
- **Impacto:** Baixo: o revendedor iniciando manualmente a venda de um curso desativado na origem geraria uma matrícula (`INTERESSADO` → fulfill) cujo provisionamento na plataforma parceira pode falhar (curso inexistente lá), deixando o aluno pago sem acesso e exigindo suporte manual. Não há vazamento cross-tenant nem cobrança na conta errada (usa o gateway do próprio tenant). É uma inconsistência de invariante ("curso inativo não vende") entre o checkout da vitrine e a venda manual do painel.
- **Correção:** Na query de `tenantCourse` incluir o status do curso e recusar se inativo: `include: { course: { select: { ..., status: true } } }` e, após `if (!tenantCourse)`, adicionar `if (tenantCourse.course.status !== "ATIVO") return NextResponse.json({ error: "Curso indisponível" }, { status: 404 })`. Espelha o gate já aplicado em `loja/checkout/route.ts` e `aluno/comprar/route.ts:407`.
- **Verificação:** Marcar um `Course` como `status="INATIVO"` mantendo o `TenantCourse.isVisible=true`, tentar `POST /api/painel/vendas` com esse `tenantCourseId` ⇒ deve retornar 404 "Curso indisponível". Teste cobrindo o branch curso-inativo.
- **Verificação (2026-07-03):** Query de `tenantCourse` agora inclui `course.status` e recusa com 404 "Curso indisponível" quando `!== "ATIVO"` (espelha ec832d0). Teste `src/app/api/painel/vendas/route.test.ts` (2 casos): curso INATIVO+isVisible=true → 404 "Curso indisponível"; TenantCourse ausente → 404 "Curso não encontrado na sua vitrine" (mensagem distinta, prova que o gate é branch próprio). Portão Zero-Erro verde (451 testes).

### [SAAS-007] Proxy: em falha transitória de resolução de tenant, serve a vitrine sem checar status e sem `x-tenant-id`
- **Severidade:** P3
- **Status:** Aberto (2026-07-03 — correção fail-closed conflita com decisão de resiliência vigente; ver nota abaixo. NÃO forçado.)
- **Nota da rodada de correção (2026-07-03):** A receita (rewrite `/loja/suspended` ou **503** quando `resolveTenantFromDB` retorna `reason:"error"`) foi implementada e provada correta, mas **quebra o teste OBS-007** (`src/proxy.test.ts:38-62`, commit f8322e9) que **enshrina o fail-OPEN** exatamente para o cenário Redis+DB fora ("faz fail-open (serve a vitrine)"). Os dois cenários são **indistinguíveis no proxy**: com Redis fora + endpoint interno fora, `resolveTenantFromRedis`→null e `resolveTenantFromDB`→`reason:"error"` — que é o mesmo estado do OBS-007. Logo, fail-closed aqui **inverte** a postura de resiliência deliberada da rodada de observabilidade, e contraria a diretriz explícita desta tarefa de **"preservar fail-open"**. Mudança revertida (`git checkout -- src/proxy.ts`), OBS-007 volta verde. **Requer decisão do dono**: (a) manter fail-open (aceitar o risco residual P3 — checkout já revalida status server-side, sem venda em tenant suspenso, sem vazamento cross-tenant), ou (b) migrar o gate de status para o downstream `/loja` (que revalida no servidor quando o DB volta), preservando fail-open no Edge. Um hard-503 no Edge não é compatível com o requisito de fail-open.
- **Local:** `src/proxy.ts:333-367`
- **Evidência:** Se `resolveTenantFromRedis` retorna null (`:333`) E `resolveTenantFromDB` falha transitoriamente (`:335`, não seta `resolvedTenant`), `resolvedTenant` fica null; o bloco de status (`:348`, `if (resolvedTenant && resolvedTenant.status !== "ACTIVE")`) é pulado e o request é reescrito para `/loja` sem `x-tenant-id` (só `x-tenant-slug` em `:362`; o `x-tenant-id` só é setado em `:363-364` sob `if (resolvedTenant)`).
- **Impacto:** Baixo e mitigado: o checkout re-valida `tenant.status !== "ACTIVE"` server-side, então não há venda em tenant suspenso. O efeito residual é a vitrine de um tenant PENDING/SUSPENDED renderizada brevemente em outage simultâneo de DB+Redis. Não há vazamento cross-tenant (o slug ainda escopa as queries da vitrine).
- **Correção:** Quando `resolvedTenant` permanecer null após o fallback de DB **e** a causa for `error` (não cache-miss legítimo), preferir rewrite para `/loja/suspended` (ou 503) em vez de servir a vitrine como ACTIVE. `resolveTenantFromDB` já distingue `reason: "not_found"` de `reason: "error"` — propagar essa distinção até o ponto do rewrite e tratar `error` como fail-closed.
- **Verificação:** Simular Redis indisponível + DB lançando ⇒ confirmar que a vitrine de um tenant não-ACTIVE não é servida como ativa (rewrite p/ /loja/suspended ou 503).

### [SAAS-008] Webhook LMS `course.completed`/`lesson.completed` para matrícula não provisionada é marcado como processado (sem retry) — possível certificado perdido em corrida
- **Severidade:** P3
- **Status:** Aberto (re-confirmado 2026-07-03)
- **Local:** `src/lib/webhooks/lms-process.ts:110,133` (`findLmsEnrollment` → `{ ok:false, message:"matrícula LMS não encontrada" }`) · `src/app/api/webhooks/lms/route.ts:106-118` (marca `processed:true` mesmo quando `result.ok === false`, respondendo 200)
- **Evidência:** Quando o evento chega para um `studentExternalId`+`courseId` sem matrícula LMS (status ACTIVE/COMPLETED/SUSPENDED), o handler retorna `{ ok:false }`. A rota faz `prisma.webhookLog.update({ data:{ processed:true, error: result.message } })` e responde **200** — o LMS NÃO re-tenta (documentado em `route.ts:106-107`). Se a conclusão for emitida antes do fulfillment do PMB criar a matrícula (race), o `course.completed` é descartado e o certificado **não** é emitido por `issueCertificateIfEligible`.
- **Impacto:** Baixo na prática (conclusão quase sempre vem depois do provisionamento), mas é perda silenciosa: aluno conclui no LMS, o PMB descarta o webhook como "não encontrado" e o certificado automático nunca é emitido nem re-tentado. O cron `sync-day-update-lms` cobre progresso por delta e tende a recuperar, mas o evento pontual de conclusão fica perdido.
- **Correção:** Para `course.completed`/`lesson.completed` com matrícula não encontrada, distinguir "negócio terminal" de "ainda não pronto": marcar `processed:true` terminal só se o `webhookLog.createdAt` for mais antigo que N minutos; caso contrário deixar `processed:false` e retornar **500** para o LMS reentregar. Alternativa: lançar exceção (em vez de `{ok:false}`) quando a matrícula não existe para `course.completed`, deixando o catch da rota responder 500 e o `sync-day-update-lms` como rede de segurança. Documentar a janela.
- **Verificação:** Simular `course.completed` antes de existir a matrícula ⇒ confirmar que a rota responde 500 (não 200) dentro da janela de retry, e que após criar a matrícula a re-entrega emite o certificado. Teste em `src/lib/webhooks/lms-webhook.test.ts` cobrindo o branch "não encontrado → retry".

### [SAAS-009] Detalhe da sub-revenda expõe ao indicador os boletos/invoice da mensalidade PMB da unidade indicada
- **Severidade:** P3
- **Status:** Corrigido (2026-07-03 — commit 081638a)
- **Local:** `src/app/painel/revendas/[id]/page.tsx:56-66,89-98` (seleciona e devolve `tenantPayments` da sub-revenda, incluindo `invoiceUrl` e `bankSlipUrl`)
- **Evidência:** A página é corretamente escopada por `referrerTenantId: sellerTenantId` (`:44`), então não há vazamento cross-tenant arbitrário. Porém entrega ao **indicador** (revendedor-vendedor) os links de fatura/boleto (`invoiceUrl`/`bankSlipUrl` em `:65-66`, mapeados em `:97-98`) da mensalidade que a sub-revenda paga à **PMB** — uma cobrança da qual o indicador não é o pagador (só ganha comissão de indicação). Os links do Asaas tipicamente permitem visualizar/pagar a fatura.
- **Impacto:** Baixo: é uma decisão de produto (o indicador acompanha e dá suporte à unidade que trouxe), e não há vazamento entre tenants não-relacionados. Risco residual: o indicador vê (e poderia pagar/abrir) o boleto da mensalidade de terceiro; expõe dados financeiros da relação sub-revenda↔PMB a um ator que não é parte dessa cobrança.
- **Correção:** Se a política for "indicador acompanha mas não paga", remover `invoiceUrl`/`bankSlipUrl` do payload `payments` em `:97-98` (manter `amount`/`status`/`dueDate`/`paidAt`/`billingType`). Se for intencional expor o boleto, documentar a decisão (memória/ADR) e adicionar `logAudit` ao acesso (cruza com SAAS-001).
- **Verificação:** Como indicador, abrir `/painel/revendas/[id]` e confirmar que o payload da sub-revenda não inclui links de pagamento da mensalidade PMB (ou que a exposição é a decisão documentada).
- **Verificação (2026-07-03):** `invoiceUrl`/`bankSlipUrl` removidos do `select`, do payload (`page.tsx`) e do tipo `SubRevendaPayment` (`sub-revenda-detail.tsx`); a coluna de ações não abre mais a fatura Asaas de cobranças pagas. Preservado o checkout interno (`/cobranca/{asaasPaymentId}`) para cobrança em aberto (afordância de suporte, não é a fatura crua). Guard de regressão em tempo de compilação (`HasKey<"invoiceUrl">`) no teste `src/components/painel/sub-revenda-detail.test.ts` — provado que re-adicionar o campo quebra o tsc. Portão Zero-Erro verde (456 testes).

---

## Cobertura

Itens do inventário relevantes ao domínio SaaS e veredito (re-verificados em 2026-07-03):

**Multi-tenancy / tenant resolver**
- `src/proxy.ts` (resolução por hostname, sanitização de `x-tenant-*` em `:235-236`, rewrite /loja, gate de status `:348`, lookup customDomain `:294`) — **OK** (sanitização segura; achado menor SAAS-007 no caminho de erro transitório). a42ccb8 **não** alterou a resolução do proxy (keyada por `customDomain`, independente de `domainVerified`) — sem regressão no P0 de resolução.
- `src/app/api/internal/resolve-tenant/route.ts` — **OK** (internal-secret + rate-limit failOpen + validação slug/domain).
- `src/lib/tenant/*` (from-request, current, urls, slug, checkout-mode, monthly-policy, forbidden-names, ensure-courses, cache-invalidation) — **OK**. Novo `activeCustomDomain(tenant)` em `urls.ts:121-127` (gate por `domainVerified` só para URLs públicas) — **OK**.
- `src/lib/pmb-tenant.ts` (placeholder `__pmb__`: ACTIVE / MANUAL / planValue 0, lazy create) — **OK**.

**Isolamento financeiro (P0 gateway collapse — blindado 8541afd/9a6adf9)**
- `src/lib/checkout/assert-tenant-gateway.ts` (`assertPmbCharge`, `assertCouponMatchesEnrollment`, `isPmbTenantSlug`) — **OK** (invariante bem documentada, lança em vez de cobrar na conta errada; testado assert-tenant-gateway.test.ts 11 casos).
- `src/lib/asaas/client.ts:64` `motherAsaasKey()` (lança se `ASAAS_API_KEY` ausente; sem fallback silencioso) — **OK** (mother-key.test.ts 2 casos).
- `src/app/api/aluno/comprar/route.ts:363-379` roteia por `Student.tenantId` autoritativo (identificação POSITIVA; revenda → `handleResellerInit` com gateway do tenant; PMB → `assertPmbCharge`) — **OK** (P0 corrigido, sem regressão).
- `assertPmbCharge`/`assertCouponMatchesEnrollment` wired em: `admin/vendas`, `checkout`, `checkout/package`, `aluno/comprar`, `loja/checkout`, `loja/checkout/package`, `painel/vendas`, `lib/checkout/issue-pmb-asaas-charge.ts` — **OK** (cobertura completa das rotas de venda).
- `src/app/api/cron/fix-gateway-collapse/route.ts` (dry-run default; `?apply=true`; re-checa status vivo antes de cancelar; POST via run_cron 9a6adf9) — **OK** (remediação idempotente, já executada em prod).

**Billing Asaas + idempotência/dunning**
- `src/app/api/webhooks/asaas/route.ts` (token global + por-tenant timing-safe, redação de header, log em webhook_logs) — **OK**.
- `src/lib/asaas/process.ts` (re-fetch autoritativo; RECEIVED→ACTIVE/unblock; OVERDUE→SUSPENDED/block AUTO; refund total→cancel commission; refund parcial→freeze+audit; subscription cancel→suspend; PMB direct sale) — **OK**.
- `src/lib/asaas/webhook.ts` (validateAsaasWebhook fail-closed sem env) — **OK**.
- `src/app/api/admin/revendedores/[id]/billing/route.ts` (planValue/free/promo/assinatura; motherAsaasKey explícito) — **OK** + audit.
- `src/app/api/admin/revendedores/[id]/route.ts` DELETE (cancela tenant + assinatura) — **OK** + audit.
- `src/app/api/admin/revendedores/[id]/status/route.ts` — **Achado SAAS-001** (sem audit).
- `src/app/api/admin/tenants/[id]/{mensalidade,referral-percent,asaas-gateway}/route.ts` — **OK** funcional; **Achado SAAS-001** (mensalidade/referral-percent sem audit).
- `src/app/api/painel/config/{billing-mode,connect-mp,connect-asaas,sales-gateway,mensalidade,parcelamento,pix}/route.ts` — **OK** (token cifrado AES-256-GCM, escopo por sessão); **Achado SAAS-001** (connect-mp/asaas sem audit).

**Lifecycle / inadimplência**
- `src/lib/auto-block.ts`, `cron/sweep-tenants-overdue`, `cron/reactivate-paid` (`canReactivateUnderTenant`), `src/lib/students/reactivation-guard.ts` — **OK** (SAAS-002 corrigido, confirmado).
- `cron/{sweep-students-overdue,sweep-students-expired,reconcile-tenant-payments}` — **OK** (cron-authorized).

**Fulfillment (EA + LMS) + credenciais por matrícula**
- `src/lib/enrollment/fulfill.ts` (advisory lock; idempotência por mp/asaasPaymentId; guard Payment.tenantId===Enrollment.tenantId; partnerAccess cifrado; satélites de pacote finalAmount 0; bolsa) — **OK**.
- `src/lib/lms/*`, `src/lib/students/{load-detail,lms-credentials,plataforma-actions}.ts` — **OK** (isolamento por tenant no caller).
- `src/app/api/aluno/curso/[enrollmentId]/acessar/route.ts` (SSO LMS; escopo studentId + status + provider) — **OK**.
- `src/app/api/painel/vendas/route.ts` (venda direta do revendedor; requireResellerSession; cap de desconto owner=100 / consultor=maxDiscount aplicado a PERCENTAGE e FIXED `:232-240`; cupom só do próprio tenant `:200-208`; assertCouponMatchesEnrollment `:216`; gateway do próprio tenant) — **OK** no isolamento; **Achado SAAS-010** (sem gate `status=ATIVO`).

**Feature gating por plano**
- `Tenant.automationEnabled`/`SystemSettings.pmbAutomationEnabled`; `src/lib/automation/{dispatch,context}.ts`; `painel/automacao/*` (403 quando !automationEnabled, SAAS-003 corrigido); `src/lib/resellers/plans.ts` (sub-revenda só 209/239; PRO liga Automação) — **OK**.

**Sub-revendas**
- `src/app/api/painel/revendas/route.ts` POST (guard `requireResellerSeller` = canSellResellers + ACTIVE; planValue só 209/239; cobrança no Asaas da PMB; referrerTenantId forçado; audit via createReseller) — **OK**.
- `src/lib/auth/guards.ts` `requireResellerSeller` — **OK**.
- `src/app/painel/revendas/[id]/page.tsx` (detalhe view-only, escopo referrerTenantId) — **OK**; **Achado SAAS-009** (expõe invoiceUrl/bankSlipUrl).
- `src/app/api/painel/revendas/leads/[id]/route.ts` — **OK**.

**Motor de comissão + clawback**
- `src/lib/referrals/{commission,clawback,payout,monthly,rules,tiers,capture,code,demonstrativo}.ts` (1-nível, anti-fraude por email, tiers, idempotência por tenantPaymentId, cancel/clawback, freeze de refund parcial; requestPayout CAS + gate de clawback + proof; processMonthlyPayouts CAS) — **OK**.
- `cron/referral-monthly-payout` + `admin/financeiro/referral-payouts/[id]/{mark-paid,proof,fail,note}` + `admin/referrals/{clawback/resolve,payouts/[id]/approve,fail}` — **OK** (mark-paid/proof têm logAudit; exports **Achado SAAS-001**).

**Audit trail (AuditLog)**
- `src/lib/audit.ts` (create + Pino, fail-safe) — **OK** como wrapper.
- COM audit: student block, cancelar matrícula, impersonate (admin reseller/aluno/equipe interna 07224cb, painel aluno), mark-paid/proof payout, exclusão conta, anonimização LGPD, billing update, tenant cancel/create, role update/member deactivate (equipe PMB), can-sell-resellers, refund parcial freeze — **OK**.
- SEM audit: painel/equipe maxDiscount+deactivate, status manual do tenant, mensalidade/referral-percent, connect-mp/asaas, cupons CRUD/toggle, exports financeiros, sales/manager/password — **Achado SAAS-001**.
- Imutabilidade da tabela (sem trigger/REVOKE) — **Achado SAAS-006**.

**Onboarding / criação de revenda**
- `src/lib/resellers/create.ts` (núcleo compartilhado; isFree→ACTIVE / paid→PENDING; TenantPayment PENDING; owner; bootstrap vitrine; branding LMS; `logAudit tenant.create`; motherAsaasKey explícito) — **OK** + audit. Criação não-transacional: item aceito por decisão do dono (memória project_lote_junho_followups).
- `admin/revendedores` POST, `revendedores/cadastro`, `painel/onboarding` — **OK** (delegam a createReseller).

**Domínio próprio (a42ccb8)**
- `src/lib/tenant/urls.ts:activeCustomDomain` (gate por domainVerified só em URLs públicas), `api/painel/dominio/route.ts` (status+applied, auto-heal), `api/painel/dominio/verify/route.ts` (verifica as 2 variantes DNS, aplica só quando apex+www apontam) — **OK** (não altera resolução do proxy; preserva o P0).

**Pacotes de cursos**
- `provisionPackageSiblings`/`provisionCourseForStudent`; `CoursePackage`/`TenantPackage`/`CoursePackageItem`; `admin/pacotes`, `painel/pacotes` — **OK**.

**Catálogo (gates COURSE_HAS_PRICE + status=ATIVO + curadoria)**
- `src/lib/catalog/{visibility,home}.ts`, `tenant/courses.ts`, `home/sections.ts`, listagens/detalhe (price > 0) — **OK** (SAAS-004 corrigido).
- `loja/{checkout,checkout-inquiry,cupom/validar,leads}` gate `status=ATIVO` (ec832d0) — **OK**.
- `src/lib/catalog/sync.ts:190-191` (EA: preserva `status`/`categoriaLoja` do admin no UPDATE) e `sync-lms.ts:195` (LMS: preserva `existing.status`) — **OK** (curadoria não revertida, 45d8af6).
- `painel/vendas` (venda manual) — **Achado SAAS-010** (não aplica `status=ATIVO`).

**Webhook LMS + aba API**
- `api/webhooks/lms/route.ts` + `lib/webhooks/lms-webhook.ts` (HMAC-SHA256 timing-safe, anti-replay 10min, idempotência por X-PMB-Event-Id / hash de conteúdo, raw body, 503 sem secret) — **OK**.
- `lib/webhooks/lms-process.ts` (handlers idempotentes; certificado via issueCertificateIfEligible; `course.updated`/`published`/`unpublished` → `syncCatalogFromLMS` respeitando curadoria `:154-157`; suporte LMS → ContactMessage por tenant) — **OK**; **Achado SAAS-008** (course.completed sem matrícula = terminal sem retry).
- `admin/configuracoes` aba API (exibe PMB_WEBHOOK_SECRET só a SUPER_ADMIN, server-side) — **OK**.

**Itens ⚠️MIGRAÇÃO / verificação manual de ambiente**
- `@upstash/redis` (REST) em `src/lib/redis.ts` e `ratelimit.ts` — ⚠️MIGRAÇÃO: REST NÃO fala Redis TCP; na VPS trocar por `ioredis`/`redis` ou SRH. Proxy usa Redis para resolver tenant no Edge — revalidar no runtime Node do Swarm.
- Billing/gateway dependem de webhooks Vercel; migração: reapontar `notification_url`/webhook URLs (Asaas + MP + LMS), healthcheck, `next.config` sem `output:'standalone'` — ⚠️MIGRAÇÃO.
- Crons via Supabase pg_cron (`app_internal.run_cron`) — ⚠️MIGRAÇÃO (scheduler próprio na VPS).
- Supabase Storage → MinIO — ⚠️MIGRAÇÃO (coberto por banco/devops).
- **Verificação manual (Vercel, não editável do repo):** `MP_WEBHOOK_SECRET`, `ASAAS_WEBHOOK_TOKEN`, `PMB_WEBHOOK_SECRET` (sem ele o webhook LMS responde 503), `LMS_API_URL`/`LMS_API_KEY`, `ENCRYPTION_KEY`, `ASAAS_API_KEY` (conta-mãe — `motherAsaasKey()` lança sem ela, quebraria vendas PMB/onboarding), `CRON_SECRET`.
