# Inconsistências Corrigidas — Rodada Corretiva 2026-06-03

Saída do **Agente de Consistência Sistêmica e Regras de Negócio** + finders de autorização, consolidada e verificada adversarialmente. Foco: divergências REAIS entre camadas (rotas irmãs, frontend↔API↔banco, enums/status, schema↔DB, regra de negócio entre camadas).

**Padrão recorrente desta rodada:** *remediação parcial entre rotas irmãs.* A auditoria anterior (2026-05-28) corrigiu o "representante" de cada família (ex.: `revoke`, `approve`, `comissoes/demonstrativo`), mas as **rotas irmãs** com a mesma sensibilidade ficaram sem o mesmo gate. A correção uniformiza o controle dentro de cada família.

| ID | Área | Inconsistência | Evidência | Correção aplicada | Status |
|---|---|---|---|---|---|
| INC-01 | AuthZ — certificados | `revoke` aplica o gate R24 (cert de revendedor exige SUPER_ADMIN), mas `download`/`regenerate`/`issue` carregam por id sem nenhum escopo de tenant. | `revoke/route.ts:50` vs `download/route.ts:28`, `regenerate/route.ts:23`, `issue/route.ts:36` (`findUnique({where:{id}})` sem checagem). | Helper `adminCanAccessCertTenant` + 403 nas 3 rotas, espelhando o escopo da listagem. | ✅ Corrigido |
| INC-02 | AuthZ — saques/comissões | `approve`/`fail` de saque escopam por `accountManagerId`, mas a **leitura/export** (`financeiro/referral-payouts`, `referrals/payouts/export`, `referrals/commissions/export`, `revendedores/[id]/comissoes/export`) não. | `payouts/[id]/approve/route.ts:53-61` (escopa) vs as 4 rotas de leitura/export (sem filtro por gerente). | PMB_SALES→403; PMB_RESELLER_MGR→`AND:[{referrer:{accountManagerId}}]`; export por-tenant espelha o `demonstrativo`. | ✅ Corrigido |
| INC-03 | AuthZ — UI×API | Telas SUPER_ADMIN-only na sidebar (`Financeiro`, `Analytics`), mas as APIs (`analytics`, `financeiro/tenant-payments`, `financeiro/overdue`) aceitavam toda a equipe PMB. | `sidebar-admin.tsx:46,51` (`roles:["SUPER_ADMIN"]`) vs rotas usando `requireAdminSession`. | Gate `role!=="SUPER_ADMIN" → 403` nas APIs, alinhando ao gate visual. | ✅ Corrigido |
| INC-04 | AuthZ — mutação global | Mutações do catálogo global divergiam: `catalogo/[id]`, `catalogo/categorias` e `system-settings` são SUPER_ADMIN, mas `catalogo/sync` (muta Course/Category/HomeSections globais) aceitava toda equipe PMB. | `catalogo/sync/route.ts:12` (`requireAdminSession`) vs irmãs SUPER_ADMIN-only. | Gate SUPER_ADMIN em `sync` e `sync-log`. | ✅ Corrigido |
| INC-05 | Regra de negócio — papel×guard | Guard "owner-only" não distinguia owner de consultor; consultor podia editar a própria membership e furar o **cap de desconto** (regra central). | `guards.ts:requireResellerOwner` só checava `session.tenantId`; consultor o tem populado (`auth.ts` effectiveTenantId). | Checagem de **owner direto** via `User.tenantId` (@unique). | ✅ Corrigido |
| INC-06 | Regra de negócio — relatórios | Relatórios cross-tenant sem gate por papel: PMB_SALES (que vê "Relatórios" na sidebar) gerava relatórios de todos os revendedores; `alunos-por-revendedor` ignora `filters.tenantId` mas não era `needsSuperAdmin`. | `definitions.ts` (defs sem flag) + runner `alunos-por-revendedor:495 async generate()` sem `filters`. | Flag `pmbSalesAllowed` (só relatórios PMB) + `alunos-por-revendedor` marcado `needsSuperAdmin`. | ✅ Corrigido |
| INC-07 | Valores monetários | Preview de desconto no checkout usava aritmética **float** (`* /100`, `toFixed`), divergindo do valor cobrado (que usa `applyCouponDiscount` com `Prisma.Decimal` + half-even). | `loja/checkout/page.tsx:38-42`. | Preview agora usa `applyCouponDiscount` — mesmo arredondamento do cobrado. | ✅ Corrigido |
| INC-08 | Schema ↔ Banco | `Enrollment.tenant`/`Enrollment.tenantCourse`/`Payment.tenant` (opcionais) sem `onDelete` explícito → Prisma assume `SetNull`, mas o banco real tem `RESTRICT` (init migration). Drift latente que geraria migration destrutiva. | `schema.prisma:575,579,659` vs `migrations/20260413_init/migration.sql:428,434,443` (`ON DELETE RESTRICT`). | `onDelete: Restrict` explícito nas 3 relações (não gera migration — já bate com o banco). | ✅ Corrigido |
| INC-09 | IDOR — checkout PMB | `checkout/status` retornava status de qualquer matrícula por id; o irmão `confirmacao/[id]/status` escopa por `tenantId:null`. | `checkout/status/route.ts:17` (`findUnique`) vs `confirmacao/[id]/status`. | `findFirst({where:{id, tenantId:null}})`. | ✅ Corrigido |
| INC-10 | PII — enumeração | `certificates/enrollments` retornava nome+CPF de qualquer aluno por `studentId` sem escopo. | `certificates/enrollments/route.ts:20-23`. | Escopo por papel ciente de `__pmb__`. | ✅ Corrigido |
| INC-11 | Dados obrigatórios — banco×API | `Lead.phone` é `NOT NULL` no banco, mas a API o trata como opcional e grava string vazia (`phone || ""`). | `schema.prisma:866` (`phone String`) vs `api/leads/route.ts:27,106`. | **Pendente (decisão de produto)** — ver abaixo. NÃO auto-corrigido (muda contrato do form/API). | ⚠️ Requer decisão |

---

## Pendências — Requer decisão humana / mudança não-mecânica

Itens reais que NÃO foram auto-corrigidos por exigirem decisão de produto, mudança de infraestrutura, ou refatoração ampla. Inclui também os itens **ainda abertos da auditoria 2026-05-28** (ver `MATRIZ_DE_RISCOS.md`).

### Crítico / Alto (infra & LGPD — herdados e ainda abertos)
| Ref | Item | Por que não auto-corrigir | Ação recomendada |
|---|---|---|---|
| R1 (prior) | **CPF em bucket Supabase público** — PDFs de certificado (nome+CPF) em bucket `certificates` público; `code` previsível (~28 bits) e exposto em `/validar/{code}`. | Toggle do bucket é config de **infra** (Supabase dashboard/API), não código. O read-path já tem `createSignedCertificateUrl`/stream via service-role pronto (`storage.ts:94`). | Tornar o bucket **privado** e migrar todo read para signed URL/stream; adicionar rate-limit em `/validar`. **P0.** |
| R3 (prior) | **Sem RLS no banco** — isolamento 100% em código (Prisma como owner). | Decisão arquitetural (habilitar RLS exige policies + revisão de todas as queries). | Avaliar RLS como rede de segurança defesa-em-profundidade. |
| R13 (prior) | **Direito de exclusão LGPD** não implementado. | Decisão de produto + fluxo de soft-delete/anonimização. | Implementar exclusão/anonimização de titular (art. 18). |
| R15 (prior) | Vercel Analytics carrega ignorando banner de cookies. | Decisão de consentimento. | Carregar analytics só após consentimento. |
| R23 (prior) | JWT 30d sem revogação — desativar usuário não invalida token vigente. | Decisão de arquitetura de sessão. | Versão de sessão/denylist no JWT callback. |

### Médio (desta rodada — decisão de produto/refator)
| Ref | Item | Arquivo | Ação recomendada |
|---|---|---|---|
| M7 | Sweep cancela matrícula **antes** de bloquear na plataforma; se o bloqueio falhar, aluno fica sem bloqueio e sem retry (não volta ao filtro). | `cron/sweep-students-expired/route.ts:82-98` | Bloquear antes de `CANCELLED`, ou estado intermediário que permaneça no filtro até o bloqueio confirmar. |
| M8 | Acesso fixo em 12 meses conflita com cursos `MONTHLY` com >12 mensalidades (aluno paga sem acesso). | `lib/enrollment/fulfill.ts:234` | Derivar prazo de `installmentsTotal` quando MONTHLY, ou política definida pelo owner. |
| M19/M20/M21 | **Agendamento de crons inconsistente**: `vercel.json` (diff em andamento) registra só 1 dos 9 crons; não há migration pg_cron versionada para nenhum. Cron crítico (bloqueia alunos) sem schedule rastreável. | `vercel.json`, `cron/**` | Definir fonte única de verdade (pg_cron versionado **ou** todos no `vercel.json`) e versionar. Confirmar com o owner onde os 9 crons realmente rodam hoje. |
| M16/M17 | N+1 em broadcast (5 queries/aluno) e em `leads` GET (reconcile com transação por lead). | `comunicacao/broadcast`, `leads/route.ts` | `createMany`/agregação; tirar reconcile do read-path (cron/throttle). |
| L6 | `metrics/public` expõe receita agregada sem auth. | `metrics/public/route.ts` | Remover `revenue` do payload público ou exigir auth. |
| L7/INC-11 | `Lead.phone` NOT NULL vs API opcional gravando `""`. | `schema.prisma:866`, `api/leads/route.ts` | (a) tornar phone obrigatório no Zod+form, ou (b) tornar a coluna opcional. |
| L20 (R18) | CSP com `'unsafe-inline'`/`'unsafe-eval'` em `script-src`. | `next.config.ts:32` | Migrar para nonces (App Router) e remover unsafe-*. |
| I10/I11 | `/api/cobranca/[paymentId]` (GET/pay-card) sem token por-cobrança (tradeoff documentado). | `cobranca/[paymentId]/**` | Token HMAC/JWT por cobrança no link. |
| L15/L19 | Falta `@@index([tenantId,createdAt])` em `Certificate`; `ContactMessage.resolvedByUserId` sem índice/FK. | `schema.prisma` | Adicionar via migration (não-destrutivo). SQL pronto no relatório. |
| L18 | Anotar `onDelete` explícito nas demais relações opcionais para refletir o banco. | `schema.prisma` | Anotar todas para eliminar drift residual. |

### Observações (não são falhas — tradeoffs/confirmações)
- Consultores (TenantMember) são **bloqueados** das rotas operacionais/PII do painel (`requireResellerSession` só admite owner). Fail-closed e seguro; **confirmar com o owner** se consultores deveriam operar CRM/alunos (I8/I9).
- Dashboard financeiro (MRR/ARR), `mark-paid`, `approve`, `impersonate`, `billing`, reset de senha de revendedor — **verificados como corretamente restritos** (INFO I1–I7). Nenhuma ação.
