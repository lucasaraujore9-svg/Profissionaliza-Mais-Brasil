# Correções Aplicadas — Rodada Corretiva 2026-06-03

**Orquestrador:** Claude Opus (multiagente — 16 finders + verificação adversarial + 9 agentes de correção em paralelo)
**Branch:** `main` · **Escopo:** código atual (780 arquivos `.ts/.tsx`, 225 route handlers)
**Relação com a rodada anterior:** Esta é uma **segunda passada** sobre a auditoria de 2026-05-28 (commit `9cad7b5`, issues 100–123). Vários achados aqui são **lacunas deixadas pela remediação anterior** — ex.: a rodada anterior escopou apenas `revoke` de certificado (R24), mas `download`/`regenerate`/`issue` nunca foram escopados; escopou `approve`/`fail` de saque, mas não as rotas de leitura/export.

**Validação pós-correção:** `tsc --noEmit` ✅ · `eslint` ✅ (1 warning pré-existente, não relacionado) · `vitest` ✅ **33/33** (28 + 5 novos).

> Convenção de risco da alteração: **Baixo** = aditivo/cirúrgico, sem mudar regra de negócio; **Médio** = altera comportamento observável de forma intencional (ex.: novo 403). Nenhuma alteração destrutiva de dados foi feita.

---

## A. Segurança / Autorização / Isolamento multi-tenant

| # | Arquivo | Problema | Correção | Motivo | Risco da alteração | Como testar |
|---|---|---|---|---|---|---|
| 1 | `src/lib/auth/guards.ts` | `requireResellerOwner` só checava `role===RESELLER && session.tenantId===tenantId`. Consultor (TenantMember) tem `session.tenantId` populado → passava no guard "owner-only" e podia, via `PATCH /api/painel/equipe/[id]`, elevar o **próprio `maxDiscount` para 100%** (bypass do cap de desconto) + gerir a equipe. | Após a checagem de role/tenant, exige **owner direto** via `prisma.user.findFirst({ where: { id, tenantId } })` (`User.tenantId` é `@unique`, só setado para owners; consultor tem `null`). | Escalonamento de privilégio + bypass de regra de negócio central. | Médio (consultor passa a receber 403 nas 4 rotas owner-only: `equipe`, `equipe/[id]`, `equipe/[id]/resend-invite`, `certificate-template`). Comportamento correto/esperado. | Logar como consultor e tentar `PATCH /api/painel/equipe/<minhaMembership>` `{maxDiscount:100}` → 403. Owner continua 200. |
| 2 | **`src/lib/certificates/admin-scope.ts`** (novo) + `certificates/[id]/download`, `certificates/[id]/regenerate`, `certificates/issue` | Rotas carregavam o certificado/matrícula por `id` **sem escopo de tenant**. Qualquer membro PMB (PMB_SALES, PMB_RESELLER_MGR) baixava (PDF com **nome+CPF**), regenerava ou emitia certificado de **qualquer** revendedor. A irmã `revoke` já aplicava o gate (R24); estas não. | Helper `adminCanAccessCertTenant(role,userId,certTenantId)` espelhando o escopo da **listagem** (SUPER_ADMIN=tudo; PMB_SALES=PMB/null; PMB_RESELLER_MGR=tenants com `accountManagerId`). Cada rota retorna 403 fora do escopo. | Vazamento/mutação cross-tenant de PII (LGPD). | Baixo (aditivo; SUPER_ADMIN inalterado). | `vitest src/lib/certificates/admin-scope.test.ts` (5 casos). Manual: PMB_SALES baixar cert de revendedor → 403. |
| 3 | `certificates/enrollments` | `GET ?studentId=` retornava **nome+CPF** + matrículas de qualquer aluno de qualquer tenant a qualquer membro PMB. | Escopo por papel ciente do placeholder `__pmb__`: PMB_SALES só alunos PMB; PMB_RESELLER_MGR só alunos de tenants sob sua gestão; demais 403. | IDOR / enumeração de PII. | Baixo. | PMB_SALES com `studentId` de aluno de revendedor → 403. |
| 4 | `revendedores/[id]/comissoes/export` | Export CSV de comissões por revendedor **sem escopo de gerente** — divergia do irmão `comissoes/demonstrativo` (que checa). | Adicionado `accountManagerId` ao select e o mesmo bloco do demonstrativo: 403 para PMB_RESELLER_MGR fora do escopo e 403 para PMB_SALES. | Vazamento financeiro cross-manager. | Médio (novo 403 para papéis fora do escopo — consistente com o irmão). | PMB_RESELLER_MGR exportar comissão de tenant alheio → 403. |
| 5 | `financeiro/referral-payouts` (lista), `referrals/payouts/export`, `referrals/commissions/export` | Leitura/export de saques e comissões expunham **chaves PIX (PII)**, valores e relacionamentos de **todos** os revendedores a qualquer membro PMB, embora `approve`/`fail` já escopem por `accountManagerId`. | PMB_SALES → 403; PMB_RESELLER_MGR → filtro `AND: [{ referrer: { accountManagerId } }]` (compõe com busca via AND). | Vazamento de PII financeira cross-manager. | Médio (escopo passa a espelhar as mutações já escopadas). | PMB_RESELLER_MGR lista/exporta → só seus tenants. PMB_SALES → 403. |
| 6 | `analytics`, `financeiro/tenant-payments`, `financeiro/overdue`, `catalogo/sync`, `catalogo/sync-log` | Usavam `requireAdminSession` (qualquer equipe PMB) embora as telas correspondentes sejam **SUPER_ADMIN-only** (sidebar). Expunham MRR/churn/ranking, mensalidades, inadimplência; e `sync` muta o catálogo **global**. | Adicionado `if (role !== "SUPER_ADMIN") 403` logo após a checagem de sessão. | Alinhar API ao gate da UI; impedir acesso por chamada direta. | Médio (PMB_SALES/MGR passam a receber 403 — coerente com a UI). | PMB_SALES chamar `GET /api/admin/analytics` → 403. |
| 7 | `relatorios/[type]` + `src/lib/reports/definitions.ts` | PMB_SALES (relatórios na sidebar dele) podia gerar relatórios **cross-tenant** (todas as vendas/alunos/pagamentos de revendedores). E `alunos-por-revendedor` (runner sem `filters.tenantId`) vazava agregado de todos os tenants ao PMB_RESELLER_MGR. | Flag `pmbSalesAllowed` (espelha `needsSuperAdmin`) em `vendas-vitrine-pmb` e `alunos-vitrine-pmb`; rota bloqueia PMB_SALES nos demais. `alunos-por-revendedor` marcado `needsSuperAdmin`. | Vazamento cross-tenant via export de relatório. | Médio (PMB_SALES restrito aos 2 relatórios PMB; MGR não acessa o agregado global). | PMB_SALES gerar `vendas-completas` → 403; `vendas-vitrine-pmb` → 200. |
| 8 | `checkout/status` | `GET ?enrollment_id=` retornava status de **qualquer** matrícula por id (sem escopo). | `findUnique` → `findFirst({ where: { id, tenantId: null } })` (endpoint é do checkout PMB; espelha o irmão `confirmacao/[id]/status`). | IDOR de baixo impacto. | Baixo. | Consultar status de matrícula de revendedor por este endpoint → 404. |
| 9 | `public/validate-ref`, `public/capture-ref` | Endpoints públicos sem autenticação que fazem lookup no banco e revelam `tenantName`, **sem rate-limit**. | `rateLimit(request, RATE_LIMITS.leads)` no topo + 429 padronizado. | Anti-enumeração/abuso. | Baixo (fail-open sem Redis em dev; fail-closed em prod). | Disparar >6 req/min do mesmo IP → 429. |

## B. Bugs / Correção funcional

| # | Arquivo | Problema | Correção | Motivo | Risco da alteração | Como testar |
|---|---|---|---|---|---|---|
| 10 | `admin/tenants/[id]/tecnica` | Salvar a config de Unidade Técnica (mesmo só o toggle/label) **zerava `tecnicaCourses`** — `validateTecnicaCoursesInput(undefined)` retorna `{courses:[]}`, destruindo o fallback usado pela vitrine. | `tecnicaCourses` só entra no `update` quando `parsed.data.courses !== undefined`. | Perda de dados em fluxo em andamento (diff não-commitado). | Baixo (preserva dados; só grava cursos quando enviados). | Salvar só `enabled` → lista de cursos preservada. |

## C. Performance

| # | Arquivo | Problema | Correção | Motivo | Risco da alteração | Como testar |
|---|---|---|---|---|---|---|
| 11 | `admin/dashboard/route.ts` | Três queries independentes (chart, topResellers, alerts) executadas em sequência. | `Promise.all([...])` com desestruturação (chamadas comprovadamente independentes). | Latência do dashboard admin. | Baixo (sem mudança de shape/lógica). | Dashboard carrega; mesma resposta, menos tempo. |

## D. Acessibilidade (aplicadas por agentes em paralelo, arquivos disjuntos)

| # | Arquivo | Problema | Correção | Risco | Como testar |
|---|---|---|---|---|---|
| 12 | `painel/student-detail-drawer.tsx` | Drawer sem semântica de dialog, sem Escape, fechar sem rótulo. | `role="dialog"` + `aria-modal` + `aria-labelledby`; `useEffect` de Escape→`onClose`; `aria-label="Fechar"`. | Baixo | Abrir drawer, Esc fecha; leitor anuncia diálogo. |
| 13 | `painel/course-edit-drawer.tsx` | Idem drawer de edição de curso. | Mesmo padrão acima. | Baixo | Idem. |
| 14 | `loja/lead-inquiry-card.tsx` | Inputs só com placeholder; status sem `aria-live`. | `aria-label` nos 3 inputs; `role="status"/aria-live` e `role="alert"` nas mensagens. | Baixo | Leitor de tela anuncia campos e feedback. |
| 15 | `admin/global-students-client.tsx` | Busca/`select` sem rótulo acessível. | `aria-label="Buscar alunos"` / `"Filtrar por origem"`. | Baixo | Leitor anuncia os controles. |
| 16 | `painel/student-list-wrapper.tsx` | Bloquear aluno (corta acesso) sem confirmação. | `confirm()` antes do fetch (type-guard p/ `nome`). | Baixo | Clicar bloquear → diálogo de confirmação. |
| 17 | `painel/student-table.tsx` | Botões-ícone só com `title` (sem nome acessível). | `aria-label` em "Ver detalhes" e bloquear/desbloquear. | Baixo | Leitor anuncia o nome do botão. |
| 18 | `painel/coupon-card.tsx` | Toggle de cupom sem `role=switch`/nome. | `role="switch"` + `aria-checked` + `aria-label`. | Baixo | Leitor anuncia switch e estado. |
| 19 | `admin/catalog-edit-drawer.tsx` | Labels sem `htmlFor`/`id`. | `id`+`htmlFor` por controle; `role="group"` para grupos de botões. | Baixo | Clicar label foca o controle. |

## E. Schema / Integridade de dados

| # | Arquivo | Problema | Correção | Motivo | Risco da alteração | Como testar |
|---|---|---|---|---|---|---|
| 20 | `prisma/schema.prisma` | `Enrollment.tenant`, `Enrollment.tenantCourse`, `Payment.tenant` (opcionais) **sem `onDelete` explícito** → Prisma assume `SetNull`, mas o banco real (init migration) tem **`RESTRICT`** → drift. Um `prisma migrate` futuro geraria migration destrutiva (RESTRICT→SET NULL, reclassificando pagamentos). | Adicionado `onDelete: Restrict` explícito nas três relações, refletindo o estado real do banco. | Prevenir migration destrutiva acidental; documentar realidade. | Baixo (apenas anotação; **não** gera migration pois já bate com o banco). | `prisma migrate diff`/`generate` → sem mudança proposta. |

## F. Testes (regressão)

| # | Arquivo | O que cobre |
|---|---|---|
| 21 | **`src/lib/certificates/admin-scope.test.ts`** (novo) | 5 casos do escopo de certificado por papel (SUPER_ADMIN/PMB_SALES/PMB_RESELLER_MGR/RESELLER), incluindo branch de `accountManagerId` com Prisma mockado. Regressão direta das correções #2/#3. |
