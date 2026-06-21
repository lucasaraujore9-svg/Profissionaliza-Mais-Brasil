# Auditoria — SaaS / Produto (multi-tenancy, billing, audit trail)
_Data: 2026-06-20 · Referência: .claude/skills/auditoria-saas/references/09-saas-produto.md · Itens do inventário cobertos: ver seção Cobertura_

## Resumo
- Itens verificados: tenant resolver + proxy, billing Asaas (webhook PMB + por-tenant), fulfillment EA/LMS, sweeps/crons de lifecycle, motor de comissão (legado + MONTHLY_TIERED) + payout/clawback, feature gating (automationEnabled), regra COURSE_HAS_PRICE, onboarding/criação de revenda, pacotes, audit trail (AuditLog).
- Achados: **P0=0 · P1=2 · P2=3 · P3=2**
- Nota do domínio: **7.5/10**

> Observação geral: o núcleo financeiro (idempotência de fulfill via advisory lock, re-fetch autoritativo do pagamento no webhook, CAS no payout, gate de clawback, defesa-em-profundidade de tenant no checkout e no proxy) está **bem construído**. Os achados concentram-se em (a) lacunas de **audit trail** em operações sensíveis que a referência exige cobrir e (b) uma **inconsistência de lifecycle** no cron de reativação. Não há vazamento entre tenants nem billing quebrado.

---

## Achados

### [SAAS-001] Audit trail ausente em operações sensíveis de billing e lifecycle de tenant
- **Severidade:** P1
- **Status:** Aberto
- **Local:**
  - `src/app/api/admin/revendedores/[id]/billing/route.ts:374` (PATCH muda `planValue`, torna gratuita, cancela/recria assinatura Asaas — sem `logAudit`)
  - `src/app/api/admin/revendedores/[id]/route.ts:464-467` (DELETE = cancela tenant / `status: "CANCELLED"` + cancela assinatura Asaas — sem `logAudit`)
  - `src/app/api/admin/revendedores/route.ts:402,427` (POST cria tenant/revenda, define planValue e status inicial — sem `logAudit`)
  - `src/app/api/admin/equipe/[id]/route.ts:132-136` (PATCH muda **role**/status de usuário PMB — sem `logAudit`) e `:167` (DELETE desativa membro da equipe — sem `logAudit`)
  - `src/app/api/painel/equipe/**` (convite/edição de consultor com `maxDiscount` — sem `logAudit`)
- **Evidência:** `grep -rln "logAudit" src` retorna apenas 8 arquivos (block/unblock aluno, cancelar matrícula, impersonate, mark-paid/proof de payout, exclusão de conta aluno/painel, anonimização LGPD). As rotas de **alteração de billing** (planValue/assinatura), **cancelamento de tenant** e **mudança de papel/permissão** — que a referência (item 4) lista explicitamente como obrigatórias — não chamam `logAudit`. O wrapper existe e é robusto (`src/lib/audit.ts`), só não está plugado nesses caminhos.
- **Impacto:** Sem trilha de "quem mudou o quê e quando" em billing e permissões, qualquer alteração indevida (rebaixar plano para R$0, cancelar revenda, promover/rebaixar admin) é irrastreável forensemente. Esta é exatamente a lição dos incidentes de exclusão em massa citada na referência. Risco de conformidade (LGPD) e de investigação de incidente.
- **Correção:** Adicionar `logAudit(...)` (de `@/lib/audit`) ao final de cada mutação sensível, capturando antes/depois:
  - billing PATCH: `action:"tenant.billing.update"`, `resource:"Tenant"`, `resourceId:id`, `payloadBefore:{planValue: Number(tenant.planValue), asaasSubscriptionId: tenant.asaasSubscriptionId, status: tenant.status}`, `payloadAfter:{planValue: parsed.data.planValue, free: clearSubscription, activated: updateData.status === "ACTIVE"}`, `actorUserId:session.userId`, `actorRole:session.role`, `tenantId:id`.
  - tenant DELETE: `action:"tenant.cancel"`, `payloadBefore:{status: <antes>}`, `payloadAfter:{status:"CANCELLED"}`.
  - tenant POST: `action:"tenant.create"`, `payloadAfter:{slug, planValue, status}`.
  - equipe PATCH: `action:"user.role.update"`, `resource:"User"`, `payloadBefore:{role: target.role, status:<antes>}`, `payloadAfter:{role: updated.role, status: updated.status}`.
  - equipe DELETE: `action:"user.deactivate"`, `payloadAfter:{status:"INATIVO"}`.
  - Capturar `ip`/`userAgent` via headers da request quando disponível.
- **Verificação:** Após a mudança, exercitar cada rota e conferir `SELECT action, resource, resource_id, actor_user_id FROM audit_logs ORDER BY created_at DESC LIMIT 10`. Adicionar teste unitário que mocka `logAudit` e afirma que foi chamado com `action` esperado.

### [SAAS-002] Cron `reactivate-paid` reativa matrícula de aluno sem checar status do tenant — fura o bloqueio por inadimplência da revenda
- **Severidade:** P1
- **Status:** Aberto
- **Local:** `src/app/api/cron/reactivate-paid/route.ts:75-110` (branch de enrollments)
- **Evidência:** O branch de enrollments seleciona `enrollment.status === "SUSPENDED"` que tenha **qualquer** `payments.some({ mpStatus: "APPROVED", paidAt: { gte: recent(48h) } })` e os reativa (`status:"ACTIVE"`) + desbloqueia o aluno na EA (`unblockStudentInEA`), **sem nenhum filtro pelo status do tenant** (não há `enrollment.tenant.status === "ACTIVE"` na cláusula `where` nem no laço). Quando uma revenda fica inadimplente, `blockTenantStudents` (`src/lib/auto-block.ts:55-58`) marca as matrículas ATIVAS como SUSPENDED. Se nesse intervalo um aluno dessa revenda tiver feito uma compra de curso recente (pagamento aprovado nas últimas 48h via MP da própria revenda), este cron o reativa e o desbloqueia — mesmo com o **tenant ainda SUSPENDED** por não-pagamento da mensalidade PMB. O branch de tenants logo acima (linhas 47-73) é corretamente escopado, mas o branch de enrollments não herda essa restrição.
- **Impacto:** Aluno de revenda inadimplente recupera acesso às aulas indevidamente, contornando o modelo de "bloqueio por inadimplência da unidade" (billingMode=AUTO). Inconsistência de lifecycle: tenant suspenso com alunos ativos. Perda de alavanca de cobrança contra o revendedor.
- **Correção:** Restringir o branch de enrollments a matrículas cujo tenant esteja ACTIVE (ou seja PMB, tenantId null). Ex.: adicionar ao `where` do `findMany`:
  ```ts
  OR: [
    { tenantId: null },                       // vitrine PMB
    { tenant: { status: "ACTIVE" } },         // revenda adimplente
  ],
  ```
  Assim, enrollments de tenant SUSPENDED/PENDING/CANCELLED não são reativadas por este cron (só voltam quando o tenant for reativado pelo branch de tenants ou pelo webhook PAYMENT_RECEIVED, que chama `unblockTenantStudents`).
- **Verificação:** Teste de integração: tenant SUSPENDED + enrollment SUSPENDED + Payment aprovado <48h ⇒ após o cron, enrollment continua SUSPENDED e aluno continua BLOQUEADO; mesma fixture com tenant ACTIVE ⇒ enrollment volta a ACTIVE.

### [SAAS-003] Feature gating do módulo Automação (plano PRO) não checado no servidor em `config` e `templates`
- **Severidade:** P2
- **Status:** ✅ Corrigido (2026-06-20) — adicionado helper `isTenantAutomationEnabled(tenantId)` em `src/lib/automation/context.ts` (leitura leve de `Tenant.automationEnabled`) e aplicado o gate de 403 (`{ error: "Recurso disponível apenas no plano com Automação", code: "AUTOMATION_DISABLED" }`) no PUT de `src/app/api/painel/automacao/config/route.ts` e `src/app/api/painel/automacao/templates/route.ts`, espelhando o guard de `whatsapp/connect`/`pair`/`status`. RESELLER do plano básico não persiste mais config/templates de Automação. Portão: tsc/lint/test (133) verdes; build delegado ao CI. (Verificação integração com DB — PUT com `automationEnabled=false` ⇒ 403 — não automatizada por falta de DB local; coberta manualmente no checklist QA.)
- **Local:** `src/app/api/painel/automacao/config/route.ts:40-77` (PUT `abandonedAfterHours`) e `src/app/api/painel/automacao/templates/route.ts:9-112` (GET/PUT templates)
- **Evidência:** `whatsapp/connect` (`:39`), `whatsapp/pair` (`:57`) e `whatsapp/status` (`:30`) bloqueiam com 403 quando `!tenant.automationEnabled`. Já `config` PUT atualiza `abandonedAfterHours` e `templates` PUT faz upsert dos templates **sem verificar `automationEnabled`** — só o leem (config) ou nem isso (templates). O gate de plano (Profissionaliza R$209 vs PRO R$239 com Automação) é `Tenant.automationEnabled` (`prisma/schema.prisma:390`).
- **Impacto:** Mitigado — o **disparo** real de WhatsApp é gateado por `ctx.enabled` em `src/lib/automation/dispatch.ts:55-58` e `:176`, então uma config gravada sem o plano não envia mensagens. Mas é uma fronteira de plano contornável no servidor: um RESELLER do plano básico consegue escrever/persistir configuração e templates de uma feature que não contratou (inconsistência de entitlement; a UI já esconde, mas a API não barra).
- **Correção:** Em ambas as rotas, após resolver `ctx`, carregar `tenant.automationEnabled` e retornar 403 (`{ error: "Recurso disponível apenas no plano com Automação", code: "AUTOMATION_DISABLED" }`) quando falso — espelhando exatamente o guard de `whatsapp/connect`. Considerar extrair um helper `requireAutomation(tenantId)` reutilizado nas 5+ rotas.
- **Verificação:** Chamar PUT em ambas com tenant `automationEnabled=false` ⇒ 403. Com `true` ⇒ 200.

### [SAAS-004] Checkout da vitrine não exige preço > 0 do TenantCourse (gate COURSE_HAS_PRICE não aplicado no caminho de compra)
- **Severidade:** P2
- **Status:** Aberto
- **Local:** `src/app/api/loja/checkout/route.ts:150-151` (busca `tenantCourse` só por `isVisible: true`, sem `price: { gt: 0 }`); reflexo em `:228` (`basePrice = Number(tenantCourse.price)`) e `:282` (`finalAmount = ... ?? basePrice`).
- **Evidência:** A invariante "curso sem valor não aparece" é aplicada em **todas as listagens/detalhe** (`src/lib/catalog/visibility.ts` + `src/lib/tenant/courses.ts:119,184,230,284` usam `price: { gt: 0 }`; `src/lib/catalog/home.ts` usa `AND:[COURSE_HAS_PRICE]`). Mas o **POST de checkout** resolve o curso por `id + tenantId + isVisible` sem o filtro de preço. Se um `TenantCourse` ficar `isVisible: true` com `price: 0` (estado inconsistente que a UI nunca exibe, mas é alcançável por id direto), o checkout aceitaria criar enrollment com `finalAmount: 0`. O `checkout/process` (`:162,219`) cobra `Number(enrollment.finalAmount)`, ou seja, geraria cobrança de R$0 / fulfillment grátis fora do fluxo de bolsa.
- **Impacto:** Defesa-em-profundidade ausente: curso vendido a R$0 indevidamente caso `price=0` + `isVisible=true` coexistam. Baixa probabilidade (exige estado inconsistente do admin), mas a invariante deve valer no caminho de receita, não só na vitrine.
- **Correção:** Adicionar `price: { gt: 0 }` ao `where` do `prisma.tenantCourse.findFirst` em `loja/checkout/route.ts:150-151` (e checar nos demais checkouts: `package/route.ts`, `process/route.ts` — confirmar que o satélite de pacote permanece com `finalAmount: 0` intencionalmente). Alternativamente, validar `if (basePrice <= 0) return 400 COURSE_NO_PRICE` após `:228`.
- **Verificação:** Forçar `TenantCourse.price=0, isVisible=true` e POST `/api/loja/checkout` ⇒ 404/400 em vez de criar enrollment R$0.

### [SAAS-005] Refund parcial de mensalidade não dispara clawback automático — depende de ação manual do admin (debt silencioso possível)
- **Severidade:** P2
- **Status:** Aberto
- **Local:** `src/lib/asaas/process.ts:581-593` (branch `PAYMENT_PARTIALLY_REFUNDED`)
- **Evidência:** Em refund **parcial**, o código deliberadamente **não** chama `cancelCommissionForTenantPayment` nem `flagMonthlyCommissionForRefund`; apenas notifica o SUPER_ADMIN ("revise manualmente"). Comentário no código reconhece a escolha (evitar over-clawback em refund pequeno). Porém a comissão correspondente pode já estar AVAILABLE/PAID e ser sacada antes de o admin agir — o gate de clawback em `payout.ts:98-120` só barra quando há marca `[CLAWBACK_PENDING]`, que o refund parcial **não cria**.
- **Impacto:** Janela em que o indicador saca comissão integral sobre uma mensalidade que foi parcialmente estornada (PMB pagou comissão sobre receita que não recebeu por inteiro). Valor tipicamente pequeno, mas é dinheiro real sem trava automática. Também não há `logAudit` do refund.
- **Correção:** Para refund parcial, ou (a) criar comissão proporcional negativa / marcar `[CLAWBACK_PENDING]` proporcional para acionar o gate de saque, ou (b) no mínimo registrar `logAudit({action:"referral.partial_refund.manual_review", ...})` e bloquear o saque do indicador até resolução (mesmo mecanismo do clawback total). Decidir com o produto qual política; documentar.
- **Verificação:** Simular `PAYMENT_PARTIALLY_REFUNDED` com comissão AVAILABLE ⇒ confirmar que `requestPayout` do indicador é bloqueado (ou que há registro auditável) até o admin resolver.

### [SAAS-006] AuditLog não tem imutabilidade garantida em nível de banco (append-only)
- **Severidade:** P3
- **Status:** Aberto
- **Local:** `prisma/schema.prisma:2046-2068` (model AuditLog) · `src/lib/audit.ts`
- **Evidência:** A referência (item 4) pede tabela de auditoria **imutável** (sem update/delete via app; append-only; RLS restrita). O projeto não usa RLS (memória do projeto: "não há RLS no banco — isolamento em código"), e não há trigger/grant impedindo `UPDATE`/`DELETE` em `audit_logs`. Qualquer caminho com o `prisma`/`service_role` pode reescrever a trilha. O wrapper só faz `create` (correto), mas nada impede mutações futuras.
- **Impacto:** Trilha forense pode ser adulterada por código futuro ou acesso direto ao banco — enfraquece o valor probatório da auditoria.
- **Correção:** Em migration, revogar `UPDATE`/`DELETE` em `public.audit_logs` do role de aplicação (ou trigger `RAISE EXCEPTION` em `BEFORE UPDATE/DELETE`). Manter só `INSERT`/`SELECT`. ⚠️MIGRAÇÃO: documentar este grant para o Postgres self-hosted (no Supabase Cloud aplica-se ao role usado pela `DATABASE_URL`).
- **Verificação:** Tentar `UPDATE audit_logs SET action='x' WHERE id=...` com o role da app ⇒ deve falhar. `INSERT` continua funcionando.

### [SAAS-007] Proxy: em falha transitória de resolução de tenant, serve a vitrine sem checar status e sem `x-tenant-id`
- **Severidade:** P3
- **Status:** Aberto
- **Local:** `src/proxy.ts:343-379`
- **Evidência:** Se `resolveTenantFromRedis` retorna null E `resolveTenantFromDB` falha transitoriamente (`reason:"error"`), `resolvedTenant` fica null, o bloco de status (`:358`) é pulado (só atua quando `resolvedTenant` é truthy) e o request é reescrito para `/loja` sem `x-tenant-id` (só `x-tenant-slug`). O comentário em `:340-342` reconhece o cache-miss mas o caminho de **erro** não bloqueia.
- **Impacto:** Baixo e mitigado: o checkout re-valida `tenant.status !== "ACTIVE"` server-side (`loja/checkout/route.ts:174`), então não há venda em tenant suspenso. O efeito residual é uma vitrine de tenant PENDING/SUSPENDED renderizada brevemente em outage de DB+Redis. Não há vazamento cross-tenant (slug ainda escopa as queries).
- **Correção:** Quando `resolvedTenant` permanecer null após o fallback de DB **e** a causa for `error` (não cache-miss legítimo), preferir rewrite para `/loja/suspended` ou retornar 503, em vez de servir a vitrine como ACTIVE. Distinguir "não resolvido por erro" de "resolvido ACTIVE".
- **Verificação:** Simular Redis indisponível + DB lançando ⇒ confirmar que vitrine de tenant não-ACTIVE não é servida como ativa.

---

## Cobertura

Itens do inventário relevantes ao domínio SaaS e veredito:

**Multi-tenancy / tenant resolver**
- `src/proxy.ts` (resolução por hostname, sanitização de `x-tenant-*`, rewrite /loja, gate de status) — **OK** (sanitização segura; achado menor SAAS-007 no caminho de erro).
- `src/app/api/internal/resolve-tenant/route.ts` — **OK** (internal-secret + rate-limit failOpen + validação slug/domain).
- `src/lib/tenant/from-request.ts`, `current.ts`, `urls.ts`, `slug.ts`, `checkout-mode.ts`, `monthly-policy.ts`, `forbidden-names.ts` — **OK** (resolução server-side, não confia em header do cliente).
- `src/lib/pmb-tenant.ts` (placeholder `__pmb__`, planValue 0, MANUAL, lazy create) — **OK**.

**Billing Asaas (cobrança de revendas)**
- `src/app/api/webhooks/asaas/route.ts` (token global + token por-tenant timing-safe, redação de header) — **OK**.
- `src/lib/asaas/process.ts` (re-fetch autoritativo do pagamento; PAYMENT_RECEIVED→ACTIVE/unblock; PAYMENT_OVERDUE→SUSPENDED/block AUTO; refund total→suspend; subscription cancel→suspend; PMB direct sale) — **OK** no fluxo principal; **Achado SAAS-005** (refund parcial sem clawback automático).
- `src/lib/asaas/webhook.ts` (validateAsaasWebhook fail-closed sem env; Zod tolerante) — **OK**.
- `src/lib/asaas/reseller-process.ts`, `transparent-process.ts`, `reconcile.ts`, `promo.ts`, `fulfillment.ts`, `ownership.ts`, `client.ts`, `types.ts` — **OK** (revisão de superfície; financeiro coberto em detalhe pelo domínio api/banco).
- `src/app/api/admin/revendedores/[id]/billing/route.ts` (planValue/free/promo/assinatura) — **Achado SAAS-001** (sem audit trail).
- `src/app/api/painel/config/billing-mode/route.ts` — **OK** (escopo por sessão RESELLER + invalidação de cache).
- Reativação de revenda gratuita no fluxo billing (`status PENDING/SUSPENDED → ACTIVE` ao zerar planValue, `billing/route.ts:364-366`) — **OK** (invariante planValue 0 = ACTIVE respeitada).

**Lifecycle / inadimplência (auto vs manual)**
- `src/lib/auto-block.ts` (blockTenantStudents/unblockTenantStudents, batching) — **OK**.
- `src/app/api/cron/sweep-tenants-overdue/route.ts` (graça por cancellationPolicy, AUTO→block, idempotente) — **OK**.
- `src/app/api/cron/reactivate-paid/route.ts` — **Achado SAAS-002** (branch de enrollment não checa status do tenant).
- `src/app/api/cron/sweep-students-overdue/route.ts` (enrollment OVERDUE→SUSPENDED, block guard por status) — **OK**.
- `src/app/api/cron/sweep-students-expired/route.ts` — **OK** (revisão de superfície; prazo 12m STUDENT_ACCESS_MONTHS).
- `src/app/api/cron/reconcile-tenant-payments/route.ts` — **OK** (revisão de superfície).
- Demais crons (cleanup-webhook-logs, sweep-abandoned-leads, sweep-visitor-events, sync-cursos[-lms], sync-day-update-lms, sync-progresso, referral-monthly-payout) — **N/A** (fora do escopo financeiro/lifecycle direto deste domínio; sync coberto por catalog/api).

**Fulfillment (matrícula automática EA + LMS)**
- `src/lib/enrollment/fulfill.ts` (advisory lock por externalPaymentId; idempotência por mp/asaasPaymentId; guard Payment.tenantId===Enrollment.tenantId; provisão EA/LMS; satélites de pacote finalAmount 0; bolsa) — **OK** (defesa-em-profundidade exemplar).
- `src/lib/lms/*` (client, provisionamento, day-update) — **OK** (revisão de superfície; ramificação por provider correta em fulfill).
- `src/lib/students/plataforma-actions.ts` (block/unblock/revoke EA+LMS) — **OK** (revisão de superfície).

**Feature gating por plano**
- `prisma/schema.prisma` `Tenant.automationEnabled` / `SystemSettings.pmbAutomationEnabled` — **OK** (modelo correto).
- `src/lib/automation/dispatch.ts`, `context.ts` (gate `enabled` no disparo) — **OK**.
- `painel/automacao/whatsapp/{connect,pair,status}` — **OK** (403 quando !automationEnabled).
- `painel/automacao/config`, `painel/automacao/templates` — **Achado SAAS-003** (gate server-side ausente).

**Motor de comissão por indicação**
- `src/lib/referrals/commission.ts` (1-nível, anti-fraude por email, tiers, gate de mínimo + backfill, idempotência por tenantPaymentId, cancel/clawback) — **OK**.
- `src/lib/referrals/payout.ts` (requestPayout com CAS + gate de clawback + proof obrigatório; markPayoutPaid idempotente; failPayout desvincula; processMonthlyPayouts com CAS e bloqueio por clawback) — **OK** (financeiramente sólido).
- `src/lib/referrals/monthly.ts`, `rules.ts`, `tiers.ts`, `capture.ts`, `code.ts`, `demonstrativo*` — **OK** (revisão de superfície; coerência com commission/payout).
- `referral-monthly-payout` cron — **OK** (delega a processMonthlyPayouts).
- `admin/financeiro/referral-payouts/[id]/{mark-paid,proof}` — **OK** (têm logAudit).

**Audit trail (AuditLog)**
- `src/lib/audit.ts` (create + Pino, fail-safe) — **OK** como wrapper.
- Operações COM audit: student block, cancelar matrícula, impersonate, mark-paid/proof payout, exclusão conta aluno/painel, anonimização LGPD — **OK**.
- Operações SEM audit: billing update, tenant cancel, tenant create, role change, member deactivate, equipe painel, coupon CRUD/toggle, refund — **Achado SAAS-001** (e SAAS-005 p/ refund).
- Imutabilidade da tabela — **Achado SAAS-006**.

**Onboarding / criação de revenda**
- `src/app/api/admin/revendedores/route.ts` POST (isFree→ACTIVE / paid→PENDING; semeia TenantPayment PENDING; cria owner; converte lead) — **OK** funcionalmente; **Achado SAAS-001** (sem audit de criação).
- `src/app/api/revendedores/cadastro/route.ts`, `painel/onboarding` — **OK** (revisão de superfície).

**Pacotes de cursos**
- `provisionPackageSiblings` / `provisionCourseForStudent` em fulfill.ts (satélites ACTIVE finalAmount 0, sem Payment, best-effort por curso, suporte a pacote misto EA+LMS) — **OK**.
- `CoursePackage`/`TenantPackage`/`CoursePackageItem` (schema) + rotas `admin/pacotes`, `painel/pacotes` — **OK** (revisão de superfície; gate de preço de pacote em `painel/pacotes` usa COURSE_HAS_PRICE).

**Regra "curso sem preço não aparece" (COURSE_HAS_PRICE)**
- `src/lib/catalog/visibility.ts`, `home.ts`, `home/sections.ts`, `tenant/courses.ts`, `sitemap.ts`, `home/showcase`, `aluno/catalogo`, `painel/pacotes`, `loja/courses` (price>0) — **OK** (gate consistente em listagens/detalhe).
- `loja/checkout` POST (caminho de receita) — **Achado SAAS-004** (gate não aplicado).

**Itens marcados ⚠️MIGRAÇÃO / verificação manual de ambiente**
- `MP_WEBHOOK_SECRET` (PMB) ausente no Vercel prod (memória project_mp_integration_prod_blockers): o webhook MP **falha-fechado** (sem fulfillment, alerta SUPER_ADMIN — `src/lib/mercadopago/process.ts:287-326`), então é correto em segurança, mas **bloqueia a matrícula automática** de vendas da vitrine PMB até a env ser setada. **Verificação manual:** confirmar `MP_WEBHOOK_SECRET` no painel Vercel (e `ASAAS_WEBHOOK_TOKEN`, `LMS_API_URL`/`LMS_API_KEY`). Não é editável a partir do repo.
- Billing/gateway dependem de Vercel hoje (webhooks Asaas/MP atingem rotas Vercel). Na migração Vercel→VPS (Swarm/Traefik): reapontar `notification_url`/webhook URLs, garantir healthcheck e que o runtime Node (não Edge) sirva os webhooks; o proxy (`src/proxy.ts`) hoje roda no Edge — revalidar resolução de tenant + cache Redis (Upstash REST → Redis TCP) no novo runtime.
