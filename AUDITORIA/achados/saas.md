# Auditoria — SaaS / Produto (multi-tenancy, billing, audit trail)
_Data: 2026-06-24 · Referência: .claude/skills/auditoria-saas/references/09-saas-produto.md · Itens do inventário cobertos: ver seção Cobertura_

## Resumo
- Itens verificados: tenant resolver + proxy, billing Asaas (webhook PMB + por-tenant), dunning/lifecycle (crons + auto-block), fulfillment EA/LMS, motor de comissão (legado + MONTHLY_TIERED) + payout/clawback (incl. freeze de refund parcial), feature gating (automationEnabled), regra COURSE_HAS_PRICE no checkout, onboarding/criação de revenda + SUB-REVENDAS (planos 209/239), pacotes, audit trail (AuditLog), webhook LMS (HMAC + idempotente), credenciais de plataforma por matrícula (partnerAccess cifrado), branding white-label, aba API (exposição de PMB_WEBHOOK_SECRET).
- Achados: **P0=0 · P1=0 · P2=2 · P3=3**
- Nota do domínio: **8.5/10** (subiu de 7.5; 4 dos 7 achados anteriores foram corrigidos e nenhum P0/P1 novo nos commits recentes).

> Re-verificação vs. 2026-06-20: **SAAS-002, SAAS-003, SAAS-004 e SAAS-005 foram CORRIGIDOS** e confirmados no código atual. **SAAS-001 foi parcialmente corrigido** — os caminhos de maior risco (billing PATCH, cancelamento de tenant, criação de revenda, mudança de papel/desativação de membro PMB) agora chamam `logAudit`; restam lacunas em rotas secundárias (consultor/maxDiscount, status manual do tenant, cupons, conexão de gateway, exports). **SAAS-006 e SAAS-007 seguem abertos** (P3, baixos e mitigados). Os commits recentes (webhook LMS, partnerAccess, branding, sub-revendas, aba API) estão **bem construídos**: HMAC timing-safe + anti-replay + idempotência no webhook, senha do LMS cifrada AES-256-GCM em repouso e nunca logada, sub-revenda gateada por `canSellResellers + status ACTIVE` e isolada por `referrerTenantId`, segredo do webhook exibido só a SUPER_ADMIN server-side. Não há vazamento entre tenants nem billing quebrado.

---

## Achados

### [SAAS-001] Audit trail ausente em operações sensíveis secundárias (consultor/maxDiscount, status manual do tenant, cupons, conexão de gateway, exportações)
- **Severidade:** P2
- **Status:** Aberto (parcialmente corrigido — escopo reduzido)
- **Local:**
  - `src/app/api/painel/equipe/[id]/route.ts:45-50` (PATCH muda `maxDiscount` — cap de desconto do consultor, uma autoridade comercial — e DELETE desativa membro; sem `logAudit`)
  - `src/app/api/admin/revendedores/[id]/status/route.ts:55-58` (PATCH transição manual de lifecycle ACTIVE/SUSPENDED/PENDING/CANCELLED do tenant; sem `logAudit`)
  - `src/app/api/admin/tenants/[id]/mensalidade/route.ts:72-84` (PUT muda capability de parcelamento; sem `logAudit`)
  - `src/app/api/admin/tenants/[id]/referral-percent/route.ts`, `.../revendedores/[id]/sales/route.ts`, `.../revendedores/[id]/manager/route.ts`, `.../revendedores/[id]/password/route.ts` (mudança de % de comissão, vínculo de vendedor/gerente e reset de senha do revendedor; sem `logAudit`)
  - `src/app/api/admin/cupons/route.ts` (POST) e `src/app/api/admin/cupons/[id]/toggle/route.ts` + `src/app/api/painel/cupons/**` (CRUD/toggle de cupom; sem `logAudit`)
  - `src/app/api/painel/config/connect-mp/route.ts` e `connect-asaas/route.ts` (POST/DELETE conecta/desconecta gateway de cobrança do tenant — credencial sensível; sem `logAudit`)
  - `src/app/api/painel/financeiro/export-csv/route.ts`, `src/app/api/admin/referrals/commissions/export/route.ts`, `src/app/api/admin/referrals/payouts/export/route.ts`, `src/app/api/admin/revendedores/[id]/comissoes/export/route.ts` (exportação de dados financeiros; sem `logAudit`)
- **Evidência:** `grep -c logAudit` nessas rotas retorna 0. A referência (item 4) lista explicitamente como obrigatório auditar: exclusão de registros, **mudança de permissão/papel**, **alteração de billing** e **exportação de dados**. Os caminhos de MAIOR risco já foram cobertos nesta rodada (billing PATCH em `revendedores/[id]/billing/route.ts:384`, cancelamento em `revendedores/[id]/route.ts:475`, criação em `lib/resellers/create.ts:228`, papel/desativação em `equipe/[id]/route.ts:140,182`). Restam os secundários acima — `maxDiscount` (autoridade de desconto), transição manual de status do tenant, conexão de gateway e exports.
- **Impacto:** Sem trilha de "quem mudou o quê e quando" nesses caminhos, alterações como rebaixar/elevar o cap de desconto de um consultor, suspender/cancelar manualmente uma revenda, trocar o gateway de cobrança ou exportar a base financeira ficam irrastreáveis forensemente. Risco residual de conformidade (LGPD) e de investigação de incidente — porém menor que na rodada anterior, pois billing/permissão de papel já estão cobertos.
- **Correção:** Adicionar `logAudit(...)` (de `@/lib/audit`) ao final de cada mutação, espelhando o padrão já aplicado em `equipe/[id]/route.ts`:
  - `painel/equipe/[id]` PATCH: `action:"tenant_member.update"`, `resource:"TenantMember"`, `resourceId:id`, `tenantId`, `payloadBefore:{maxDiscount: member.maxDiscount, status: member.status}`, `payloadAfter: parsed.data`, `actorUserId: guard.session.userId`, `actorRole: guard.session.role`; DELETE: `action:"tenant_member.deactivate"`.
  - `revendedores/[id]/status` PATCH: `action:"tenant.status.update"`, `payloadBefore:{status:<antes>}`, `payloadAfter:{status: parsed.data.status}` (carregar status antigo no `select`).
  - `connect-mp`/`connect-asaas`: `action:"tenant.gateway.connect"`/`"...disconnect"`, `resource:"Tenant"`, sem incluir token no payload.
  - exports: `action:"data.export"`, `resource:"<commissions|payouts|financeiro>"`, `payloadAfter:{rows: <n>, filters: <safe>}`.
  - cupons/mensalidade/referral-percent/sales/manager/password: `action` análogo (`coupon.create`, `coupon.toggle`, `tenant.monthly.update`, `tenant.referral_percent.update`, `tenant.sales.update`, `tenant.manager.update`, `reseller.password.reset`).
- **Verificação:** Exercitar cada rota e conferir `SELECT action, resource, resource_id, actor_user_id FROM audit_logs ORDER BY created_at DESC LIMIT 20`. Teste unitário que mocka `logAudit` e afirma a chamada com o `action` esperado por rota.

### [SAAS-006] AuditLog não tem imutabilidade garantida em nível de banco (append-only)
- **Severidade:** P2
- **Status:** Aberto
- **Local:** `prisma/migrations/20260528_audit_logs/migration.sql` (só cria a tabela + índices; sem REVOKE/trigger) · `prisma/schema.prisma:~2046` (model AuditLog) · `src/lib/audit.ts` (só faz `create`)
- **Evidência:** A referência (item 4) pede tabela de auditoria **imutável** (sem update/delete via app; append-only; acesso restrito). `grep -rln "REVOKE|BEFORE UPDATE|BEFORE DELETE|RAISE EXCEPTION" prisma/migrations` não retorna nada para `audit_logs`. O projeto não usa RLS (isolamento em código), e não há trigger/grant impedindo `UPDATE`/`DELETE` em `audit_logs`. O wrapper `logAudit` só faz `prisma.auditLog.create` (correto), mas qualquer código futuro com acesso ao client `prisma` (ou a `service_role` no Supabase) pode reescrever/apagar a trilha. Com a cobertura de auditoria aumentando (billing, cancelamento, papéis), o valor probatório da tabela cresce — e a falta de imutabilidade vira mais relevante. Elevado de P3→P2 por isso.
- **Impacto:** Trilha forense pode ser adulterada por código futuro ou acesso direto ao banco — enfraquece exatamente o que a auditoria deveria garantir (a lição dos incidentes de exclusão em massa). Sem isso, um ator com acesso ao banco pode billing-update + apagar o registro de auditoria correspondente.
- **Correção:** Em migration idempotente nova (o runner `scripts/apply-pending-migrations.mjs` exige idempotência), criar trigger `BEFORE UPDATE OR DELETE ON audit_logs` que faz `RAISE EXCEPTION 'audit_logs is append-only'` (mais portável entre Supabase Cloud e Postgres self-hosted do que depender de GRANT por role). Ex.:
  ```sql
  CREATE OR REPLACE FUNCTION audit_logs_immutable() RETURNS trigger AS $$
  BEGIN RAISE EXCEPTION 'audit_logs is append-only'; END; $$ LANGUAGE plpgsql;
  DROP TRIGGER IF EXISTS audit_logs_no_mutation ON audit_logs;
  CREATE TRIGGER audit_logs_no_mutation BEFORE UPDATE OR DELETE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();
  ```
  ⚠️MIGRAÇÃO: o trigger é portável e roda igual no Postgres self-hosted do Swarm. Se quiser também REVOKE por role, documentar o role usado pela `DATABASE_URL` (Supavisor → pgBouncer na VPS).
- **Verificação:** `UPDATE audit_logs SET action='x' WHERE id=...` e `DELETE FROM audit_logs ...` com o role da app devem falhar; `INSERT` continua funcionando. Rodar `logAudit` em qualquer rota auditada e confirmar persistência.

### [SAAS-007] Proxy: em falha transitória de resolução de tenant, serve a vitrine sem checar status e sem `x-tenant-id`
- **Severidade:** P3
- **Status:** Aberto
- **Local:** `src/proxy.ts:333-369`
- **Evidência:** Se `resolveTenantFromRedis` retorna null E `resolveTenantFromDB` falha transitoriamente, `resolvedTenant` fica null; o bloco de status (`:348`, `if (resolvedTenant && resolvedTenant.status !== "ACTIVE")`) é pulado e o request é reescrito para `/loja` sem `x-tenant-id` (só `x-tenant-slug`, `:362-365`). O comentário em `:330-332` reconhece o cache-miss, mas o caminho de **erro** de DB não bloqueia.
- **Impacto:** Baixo e mitigado: o checkout re-valida `tenant.status !== "ACTIVE"` server-side (`loja/checkout/route.ts:174`), então não há venda em tenant suspenso. O efeito residual é a vitrine de um tenant PENDING/SUSPENDED renderizada brevemente em outage simultâneo de DB+Redis. Não há vazamento cross-tenant (o slug ainda escopa as queries da vitrine).
- **Correção:** Quando `resolvedTenant` permanecer null após o fallback de DB **e** a causa for `error` (não cache-miss legítimo), preferir rewrite para `/loja/suspended` (ou 503) em vez de servir a vitrine como ACTIVE. `resolveTenantFromDB` já distingue `reason: "not_found"` de `reason: "error"` (`:216-223`) — propagar essa distinção até o ponto do rewrite e tratar `error` como fail-closed (ou degradar para a vitrine só em cache-miss explícito).
- **Verificação:** Simular Redis indisponível + DB lançando ⇒ confirmar que a vitrine de um tenant não-ACTIVE não é servida como ativa (rewrite p/ /loja/suspended ou 503).

### [SAAS-008] Webhook LMS `course.completed`/`lesson.completed` para matrícula ainda não provisionada é marcado como processado (sem retry) — possível certificado perdido em corrida
- **Severidade:** P3
- **Status:** Aberto (achado NOVO — commit 2f2f708)
- **Local:** `src/lib/webhooks/lms-process.ts:105-106,128-129` (`findLmsEnrollment` → `{ ok:false, message:"matrícula LMS não encontrada" }`) · `src/app/api/webhooks/lms/route.ts:102-111` (marca `processed: true` mesmo quando `result.ok === false`)
- **Evidência:** Quando o evento chega para um `studentExternalId`+`courseId` sem matrícula LMS (status ACTIVE/COMPLETED/SUSPENDED), o handler retorna `{ ok:false }`. A rota então faz `prisma.webhookLog.update({ data: { processed:true, error: result.message } })` e responde **200** — ou seja, o LMS NÃO re-tenta. O comentário em `:99-100` documenta a escolha ("falha de negócio → 200, retry não ajuda"). Mas se a conclusão do curso for emitida pelo LMS num intervalo em que o fulfillment do PMB ainda não criou a matrícula (race entre provisionamento e conclusão muito rápida, ou matrícula CANCELLED/expirada), o evento `course.completed` é descartado e o certificado **não** é emitido por `issueCertificateIfEligible`.
- **Impacto:** Baixo na prática (a conclusão quase sempre vem muito depois do provisionamento), mas é uma perda silenciosa: aluno conclui no LMS, o PMB descarta o webhook como "não encontrado" e o certificado automático nunca é emitido nem re-tentado. O cron `sync-day-update-lms` cobre progresso por delta e tende a recuperar, mas o evento pontual de conclusão fica perdido.
- **Correção:** Para `course.completed`/`lesson.completed` com matrícula não encontrada, distinguir "negócio terminal" de "ainda não pronto": responder **500** (LMS re-tenta) por uma janela curta — p.ex. só marcar `processed:true` terminal se o `webhookLog.createdAt` for mais antigo que N minutos (ou contar tentativas); caso contrário deixar `processed:false` e retornar 500 para o LMS reentregar. Alternativa mais simples: no `processLmsWebhookEvent`, lançar exceção (em vez de `{ok:false}`) quando a matrícula não existe para `course.completed`, deixando o catch da rota responder 500 e o `sync-day-update-lms` como rede de segurança. Documentar a janela escolhida.
- **Verificação:** Simular `course.completed` antes de existir a matrícula ⇒ confirmar que a rota responde 500 (não 200) dentro da janela de retry, e que após criar a matrícula a re-entrega emite o certificado. Teste em `src/lib/webhooks/lms-webhook.test.ts` cobrindo o branch "não encontrado → retry".

### [SAAS-009] Detalhe da sub-revenda expõe ao indicador os boletos/invoice da mensalidade PMB da unidade indicada
- **Severidade:** P3
- **Status:** Aberto (achado NOVO — commits bccb925/d397302/30918bb/d561621)
- **Local:** `src/app/painel/revendas/[id]/page.tsx:56-99` (seleciona e devolve `tenantPayments` da sub-revenda, incluindo `invoiceUrl` e `bankSlipUrl`)
- **Evidência:** A página é corretamente escopada por `referrerTenantId: sellerTenantId` (`:43-44`), então não há vazamento cross-tenant arbitrário. Porém ela entrega ao **indicador** (revendedor-vendedor) os links de fatura/boleto (`invoiceUrl`/`bankSlipUrl`) da mensalidade que a sub-revenda paga à **PMB** — uma cobrança da qual o indicador não é o pagador (ele só ganha comissão de indicação). Os links do Asaas tipicamente permitem visualizar/pagar a fatura.
- **Impacto:** Baixo: é uma decisão de produto (o indicador acompanha e dá suporte à unidade que trouxe), e não há vazamento entre tenants não-relacionados. Risco residual: o indicador vê (e poderia pagar/abrir) o boleto da mensalidade de terceiro; expõe dados financeiros da relação sub-revenda↔PMB a um ator que não é parte dessa cobrança. Avaliar com o produto se o indicador deve ver só status/valor/vencimento (sem os links de pagamento) ou também o invoiceUrl.
- **Correção:** Se a política for "indicador acompanha mas não paga", remover `invoiceUrl`/`bankSlipUrl` do payload `payments` em `:97-98` (manter `amount`/`status`/`dueDate`/`paidAt`/`billingType`). Se for intencional expor o boleto, documentar a decisão (memória/ADR) e adicionar `logAudit` ao acesso (cruza com SAAS-001 / exportação).
- **Verificação:** Como indicador, abrir `/painel/revendas/[id]` e confirmar que o payload da sub-revenda não inclui links de pagamento da mensalidade PMB (ou que a exposição é a decisão documentada).

---

## Cobertura

Itens do inventário relevantes ao domínio SaaS e veredito (re-verificados em 2026-06-24):

**Multi-tenancy / tenant resolver**
- `src/proxy.ts` (resolução por hostname, sanitização de `x-tenant-*` em `:235-236`, rewrite /loja, gate de status `:348`) — **OK** (sanitização segura; achado menor SAAS-007 no caminho de erro transitório).
- `src/app/api/internal/resolve-tenant/route.ts` — **OK** (internal-secret + rate-limit failOpen + validação slug/domain).
- `src/lib/tenant/*` (from-request, current, urls, slug, checkout-mode, monthly-policy, forbidden-names, ensure-courses, cache-invalidation) — **OK** (resolução server-side; nunca confia em header do cliente).
- `src/lib/pmb-tenant.ts` (placeholder `__pmb__`: status ACTIVE / billingMode MANUAL / planValue 0, lazy create) — **OK** (também garante que `canReactivateUnderTenant` permita alunos PMB).

**Billing Asaas (cobrança de revendas) + idempotência/dunning**
- `src/app/api/webhooks/asaas/route.ts` (token global + token por-tenant timing-safe, redação de header, log em webhook_logs) — **OK** (sem dedup por event-id — Asaas não envia um estável; idempotência garantida pelas transições de estado do processador).
- `src/lib/asaas/process.ts` (re-fetch autoritativo; PAYMENT_RECEIVED→ACTIVE/unblock; PAYMENT_OVERDUE→SUSPENDED/block AUTO; refund total→cancel commission; refund parcial→**freeze**+audit+notify; subscription cancel→suspend; PMB direct sale) — **OK**; **SAAS-005 CORRIGIDO** (freeze de refund parcial + gate de payout).
- `src/lib/asaas/webhook.ts` (validateAsaasWebhook fail-closed sem env; Zod tolerante) — **OK**.
- `src/lib/asaas/{reseller-process,transparent-process,reconcile,promo,fulfillment,ownership,client,types}.ts` — **OK** (superfície; financeiro coberto em api/banco).
- `src/app/api/admin/revendedores/[id]/billing/route.ts` (planValue/free/promo/assinatura) — **OK** + audit (`:384`) — **SAAS-001 corrigido aqui**.
- `src/app/api/admin/revendedores/[id]/route.ts` DELETE (cancela tenant + assinatura) — **OK** + audit (`:475`) — **SAAS-001 corrigido aqui**.
- `src/app/api/admin/revendedores/[id]/status/route.ts` (status manual) — **Achado SAAS-001** (sem audit).
- `src/app/api/admin/tenants/[id]/{mensalidade,referral-percent,asaas-gateway}/route.ts` — **OK** funcional; **Achado SAAS-001** (sem audit em mensalidade/referral-percent).
- `src/app/api/painel/config/billing-mode/route.ts` — **OK** (escopo por sessão RESELLER + invalidação de cache).
- `src/app/api/painel/config/{connect-mp,connect-asaas,sales-gateway,mensalidade,pix}/route.ts` — **OK** (token cifrado AES-256-GCM, escopo por sessão); **Achado SAAS-001** (connect-mp/asaas sem audit de conexão de gateway).

**Lifecycle / inadimplência (auto vs manual)**
- `src/lib/auto-block.ts` (block/unblockTenantStudents, batching) — **OK**.
- `src/app/api/cron/sweep-tenants-overdue/route.ts` (graça por cancellationPolicy, AUTO→block, idempotente) — **OK**.
- `src/app/api/cron/reactivate-paid/route.ts` — **OK** — **SAAS-002 CORRIGIDO** (`canReactivateUnderTenant(tenant?.status)` no branch de enrollments, `:103`).
- `src/lib/students/reactivation-guard.ts` (`canReactivateUnderTenant` = só ACTIVE) — **OK** (novo helper testado).
- `src/app/api/cron/{sweep-students-overdue,sweep-students-expired,reconcile-tenant-payments}/route.ts` — **OK** (superfície; cron-authorized).
- Demais crons (cleanup-webhook-logs, sweep-abandoned-leads, sweep-visitor-events, sync-cursos[-lms], sync-day-update-lms, sync-lms-branding, sync-progresso, resync-lms-credentials, resync-platform-passwords, referral-monthly-payout) — **N/A** ao lifecycle/billing direto OU **OK** (resync-lms-credentials: cifra em repouso, nunca retorna senha em claro, cron-authorized).

**Fulfillment (matrícula automática EA + LMS) + credenciais por matrícula**
- `src/lib/enrollment/fulfill.ts` (advisory lock por externalPaymentId; idempotência por mp/asaasPaymentId; guard Payment.tenantId===Enrollment.tenantId; provisão EA/LMS; partnerAccess cifrado `:762-763,883`; satélites de pacote finalAmount 0; bolsa) — **OK** (defesa-em-profundidade; senha LMS cifrada AES-256-GCM, nunca logada).
- `src/lib/lms/*` (client Bearer, branding, provisionamento, day-update, types, config, errors) — **OK** (superfície; auth por env, ramificação por provider correta).
- `src/lib/students/load-detail.ts` + `lms-credentials.ts` (decifra para exibir na gestão; degrada a null se corrompido; filtra por tenantId quando painel) — **OK** (isolamento por tenant no caller; `painel/alunos/[id]/page.tsx:22-25` passa session.tenantId).
- `src/app/api/aluno/curso/[enrollmentId]/acessar/route.ts` (SSO LMS; escopo `studentId === session.studentId` + status ACTIVE/COMPLETED + provider LMS; portalUrl do banco) — **OK**.
- `src/lib/students/plataforma-actions.ts` (block/unblock/revoke EA+LMS) — **OK** (superfície).

**Feature gating por plano**
- `prisma/schema.prisma` `Tenant.automationEnabled` / `SystemSettings.pmbAutomationEnabled` — **OK** (modelo correto).
- `src/lib/automation/{dispatch,context}.ts` (gate `enabled` no disparo; helper `isTenantAutomationEnabled`) — **OK**.
- `painel/automacao/whatsapp/{connect,pair,status}` — **OK** (403 quando !automationEnabled).
- `painel/automacao/{config,templates}` — **OK** — **SAAS-003 CORRIGIDO** (gate `isTenantAutomationEnabled` → 403 AUTOMATION_DISABLED, `config:53`/`templates:78`).
- `src/lib/resellers/plans.ts` (sub-revenda só 209/239; PRO liga Automação) + `isAllowedResellerPlan`/`planEnablesAutomation` — **OK** (testado em plans.test.ts).

**Sub-revendas (módulo "revender revendas")**
- `src/app/api/painel/revendas/route.ts` POST (cria sub-revenda) — **OK** (guard `requireResellerSeller` = canSellResellers + status ACTIVE; planValue só 209/239; cobrança no Asaas da PMB; referrerTenantId forçado; audit via createReseller).
- `src/lib/auth/guards.ts` `requireResellerSeller` — **OK** (exige owner + canSellResellers + ACTIVE).
- `src/app/painel/revendas/[id]/page.tsx` (detalhe view-only) — **OK** (escopo `referrerTenantId: sellerTenantId`); **Achado SAAS-009** (expõe invoiceUrl/bankSlipUrl da mensalidade PMB ao indicador).
- `src/app/api/painel/revendas/leads/[id]/route.ts` (conversão de lead de revenda) — **OK** (superfície; escopo por referrerTenantId).
- Impersonação de sub-revenda removida (substituída por view) — **OK** (sem impersonate em api/painel/revendas).

**Motor de comissão por indicação + clawback**
- `src/lib/referrals/commission.ts` (1-nível, anti-fraude por email, tiers, gate de mínimo + backfill, idempotência por tenantPaymentId, cancel/clawback, `freezeCommissionForPartialRefund`) — **OK**.
- `src/lib/referrals/clawback.ts` (CLAWBACK_MARKER_PREFIX, isClawbackMarked, hasClawbackBlock) — **OK** (centralizado; testado).
- `src/lib/referrals/payout.ts` (requestPayout CAS + gate de clawback ampliado p/ qualquer comissão marcada + proof obrigatório; markPayoutPaid idempotente; processMonthlyPayouts CAS + bloqueio por clawback) — **OK**.
- `src/lib/referrals/{monthly,rules,tiers,capture,code,demonstrativo*}.ts` — **OK** (superfície; coerência com commission/payout).
- `referral-monthly-payout` cron + `admin/financeiro/referral-payouts/[id]/{mark-paid,proof,fail,note}` + `admin/referrals/{clawback/resolve,payouts/[id]/approve,fail}` — **OK** (mark-paid/proof têm logAudit).

**Audit trail (AuditLog)**
- `src/lib/audit.ts` (create + Pino, fail-safe) — **OK** como wrapper.
- COM audit (17 arquivos): student block, cancelar matrícula, impersonate (admin reseller/aluno + painel aluno), mark-paid/proof payout, exclusão conta aluno/painel, anonimização LGPD, **billing update**, **tenant cancel**, **tenant create**, **role update / member deactivate (equipe PMB)**, **can-sell-resellers**, **refund parcial freeze** — **OK** (SAAS-001 parcialmente corrigido).
- SEM audit: painel/equipe maxDiscount+deactivate, status manual do tenant, mensalidade/referral-percent, connect-mp/asaas, cupons CRUD/toggle, exports financeiros — **Achado SAAS-001**.
- Imutabilidade da tabela (sem trigger/REVOKE) — **Achado SAAS-006**.

**Onboarding / criação de revenda**
- `src/lib/resellers/create.ts` (núcleo compartilhado admin + painel; isFree→ACTIVE / paid→PENDING; semeia TenantPayment PENDING; cria owner; bootstrap vitrine; branding LMS; `logAudit tenant.create` `:228`) — **OK** + audit. Observação: criação não é transacional (tenant→user em chamadas separadas) — item aceito por decisão do dono (memória project_lote_junho_followups); não re-elevado.
- `src/app/api/admin/revendedores/route.ts` POST, `src/app/api/revendedores/cadastro/route.ts`, `painel/onboarding` — **OK** (superfície; delegam a createReseller / fluxo de cadastro).

**Pacotes de cursos**
- `provisionPackageSiblings`/`provisionCourseForStudent` em fulfill.ts (satélites ACTIVE finalAmount 0, sem Payment, best-effort, pacote misto EA+LMS) — **OK**.
- `CoursePackage`/`TenantPackage`/`CoursePackageItem` (schema) + `admin/pacotes`, `painel/pacotes` (gate COURSE_HAS_PRICE) — **OK** (superfície).

**Regra "curso sem preço não aparece" (COURSE_HAS_PRICE)**
- `src/lib/catalog/{visibility,home}.ts`, `tenant/courses.ts`, `home/sections.ts`, `sitemap`, showcase, aluno/catalogo, painel/pacotes, loja/courses (price > 0) — **OK** (gate consistente em listagens/detalhe).
- `loja/checkout` POST (caminho de receita) — **OK** — **SAAS-004 CORRIGIDO** (`price: { gt: 0 }` na query `:157` + `isSellablePrice(basePrice)` `:240` → 400 COURSE_NO_PRICE).

**Webhook LMS + aba API (commits recentes)**
- `src/app/api/webhooks/lms/route.ts` + `src/lib/webhooks/lms-webhook.ts` (HMAC-SHA256 timing-safe sobre `<ts>.<rawBody>`, anti-replay 10min, idempotência por X-PMB-Event-Id, raw body, 503 sem secret) — **OK** (bem construído).
- `src/lib/webhooks/lms-process.ts` (handlers idempotentes; certificado via issueCertificateIfEligible; suporte LMS → ContactMessage por tenant) — **OK**; **Achado SAAS-008** (course.completed sem matrícula = terminal sem retry).
- `src/app/admin/configuracoes/page.tsx:43-44` + `components/admin/{admin-config-client,api-docs-tab}.tsx` (exibe PMB_WEBHOOK_SECRET) — **OK** (só SUPER_ADMIN, lido server-side de `env` não-NEXT_PUBLIC, forwarded só ao payload do próprio SUPER_ADMIN; `env.ts:86` define o secret como server-only com min 16).

**Itens ⚠️MIGRAÇÃO / verificação manual de ambiente**
- `@upstash/redis` (REST) usado em `src/lib/redis.ts:1` e `src/lib/ratelimit.ts` — ⚠️MIGRAÇÃO: REST NÃO fala Redis TCP; na VPS (Swarm) trocar por `ioredis`/`redis` ou rodar SRH/Upstash-compatible. O proxy (`src/proxy.ts`) usa o cliente Redis para resolver tenant no Edge — revalidar no runtime Node do Swarm (runtime Edge da Vercel não existe lá).
- Billing/gateway dependem de webhooks atingindo rotas Vercel hoje. Migração: reapontar `notification_url`/webhook URLs (Asaas + MP + LMS), garantir healthcheck e que o runtime Node sirva os webhooks. `next.config` sem `output:'standalone'` — ⚠️MIGRAÇÃO: setar para imagem Docker enxuta no Swarm.
- Crons via Supabase pg_cron (`app_internal.run_cron`) — ⚠️MIGRAÇÃO: na VPS, mover para scheduler próprio (cron do host / job no Swarm) ou manter pg_cron no Postgres self-hosted.
- Supabase Storage (logos/comprovantes/capas) → MinIO na VPS — ⚠️MIGRAÇÃO (coberto por banco/devops).
- **Verificação manual:** confirmar no painel Vercel (não editável do repo): `MP_WEBHOOK_SECRET`, `ASAAS_WEBHOOK_TOKEN`, `PMB_WEBHOOK_SECRET` (LMS receiver — sem ele o webhook responde 503), `LMS_API_URL`/`LMS_API_KEY`, `ENCRYPTION_KEY`, `CRON_SECRET`.
