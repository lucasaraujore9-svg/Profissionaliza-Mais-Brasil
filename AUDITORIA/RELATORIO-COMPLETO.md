# RELATÓRIO COMPLETO DE AUDITORIA — Profissionaliza Mais Brasil

> SaaS multi-tenant de revenda de cursos · Next.js 16 + React 19 + Prisma 7 (PostgreSQL/Supabase) + NextAuth v5
> Auditoria executada em **2026-05-30** · Escopo: 764 arquivos, ~98.300 LOC, 216 route handlers, 112 páginas, ~45 models Prisma
> Método: mapeamento manual + checagens determinísticas (`tsc`/`eslint`/`npm audit`) + **44 sub-agentes** de varredura paralela + **verificação adversarial** dos achados críticos. Total bruto: **133 achados**.

---

## 1. Resumo executivo

O projeto é **maduro e bem estruturado**: TypeScript strict compila com **0 erros**, ESLint sem erros, arquitetura limpa (camadas `app`/`components`/`lib`, padrão *fat server*), segredos não versionados, headers de segurança presentes, rate-limit no login, criptografia AES-256-GCM dos tokens MP, e — ponto alto — o `proxy.ts` **sanitiza headers `x-tenant-*` injetados pelo cliente** e os helpers de auth **falham fechado** (cron/internal sem secret = rejeita, com `timingSafeEqual`).

**Porém**, a auditoria encontrou um **padrão sistêmico e grave de quebra de isolamento multi-tenant**: como a arquitetura **não usa RLS** (o acesso é via Prisma como owner), toda a segurança depende de cada query filtrar `tenantId` — e **dezenas de rotas autenticadas leem/mutam recursos por `id` sem validar a que tenant pertencem**. A verificação adversarial **confirmou 17 de 24** achados críticos/altos checados (7 foram refutados/rebaixados, incluindo 4 falsos positivos), o que dá alta confiança no núcleo dos problemas.

### Os 5 riscos mais urgentes

1. 🔴 **IDOR / cross-tenant na família `/api/admin/alunos/[id]/*`** (route PATCH, `bloquear`, `desbloquear`, `notify`, `reset-password`, `cursos`). O `GET` escopa por `tenantId` do tenant PMB, mas as **mutações usam `findUnique({where:{id}})` sem `tenantId`** → qualquer admin PMB (inclusive **PMB_SALES** e **PMB_RESELLER_MGR**, que deveriam ser limitados) edita/bloqueia/reseta senha de alunos de **qualquer revendedor**. *Verificado: CONFIRMADO (Crítico).*
2. 🔴 **Vazamento de catálogo cross-tenant** em `GET /api/aluno/catalogo` e nas funções `loadShowcase/loadCurated/loadByCategoria/loadCatalogo` de `src/lib/catalog/home.ts`: consultam a tabela global `Course` sem aplicar `visibilityFilter(tenantId)`/`TenantCourse` → uma vitrine exibe cursos não habilitados para ela; alunos enumeram todo o catálogo global. *Verificado: CONFIRMADO (Crítico).*
3. 🔴 **Emissão e download de certificados sem escopo de tenant** (`/api/admin/certificates/issue`, `[id]/download`, `[id]/regenerate`): `findUnique` por `id`/`enrollmentId` sem `tenantId` → emissão de certificados fraudulentos e download de certificados de outros tenants. *Verificado: CONFIRMADO (Crítico).*
4. 🔴 **Funções de domínio sem escopo de tenant** em `src/lib/students/management.ts` (`applyStudentEdit`, `resetStudentPassword`): recebem só `studentId`, sem `tenantId` — qualquer chamador com um `id` válido age cross-tenant (account takeover via reset de senha). *Verificado: CONFIRMADO (Crítico).* Corrigir aqui **conserta vários endpoints de uma vez**.
5. 🟠 **Enumeração de pagamentos no endpoint público `/api/cobranca/[paymentId]`** (+ `pay-card`): `isKnownAsaasPayment()` confirma existência de IDs sem auth, com rate-limit fraco → enumeração de cobranças e dados associados. **+ Replay de webhook MP** (`src/lib/mercadopago/webhook.ts`): HMAC validado mas **sem checagem de timestamp** → replay de notificações de pagamento. *Ambos verificados: CONFIRMADOS (Alto).*

**Causa-raiz comum dos itens 1–4:** ausência de uma camada que force `tenantId` em todo acesso. Recomendação estratégica: **(a)** padronizar acesso por `id` sempre via `findFirst({where:{id, tenantId}})`; **(b)** passar `tenantId` como parâmetro obrigatório às funções de `lib/`; **(c)** como defesa em profundidade, considerar **RLS no Postgres** (Supabase) ou um Prisma client extension que injete `tenantId` no contexto de vitrine.

---

## 2. Métricas

### 2.1 Achados brutos por severidade (133)

| Severidade | Qtd bruta |
|---|---|
| 🔴 Crítico | 22 |
| 🟠 Alto | 34 |
| 🟡 Médio | 41 |
| 🔵 Baixo | 15 |
| ⚪ Informativo | 21 |
| **Total** | **133** |

### 2.2 Resultado da verificação adversarial (24 críticos/altos checados)

| Veredito | Qtd |
|---|---|
| ✅ Confirmado (real) | 17 |
| ⚠️ Rebaixado (Médio/Baixo) | 3 |
| ❌ Falso positivo | 4 |

**Falsos positivos identificados** (não corrigir — registrados para evitar retrabalho):
- Geração de cupom com `Math.random()` — protegida por auth + unique constraint.
- CSRF com `sameSite=lax` — mutações usam corpo JSON/validação própria.
- Paginação "DoS" via `NaN` em `/api/admin/vendas` — `Prisma` rejeita `take: NaN`.
- Preço de curso com `Number()` — campo é `Decimal` do Postgres, nunca string inválida.
- **(+1 verificado pelo auditor)** Cron `cleanup-webhook-logs` "sem segredo" — **na verdade chama `isCronAuthorized()`** (fail-closed). Falso positivo.

### 2.3 Por fase

| Fase | Crít | Alto | Méd | Baixo | Info | Arquivo |
|---|---|---|---|---|---|---|
| 2 — Segurança | 16 | 6 | 11 | 11 | 13 | `FASE-2-SEGURANCA.md` |
| 3 — Acesso | 1 | 5 | 4 | 1 | 0 | `FASE-3-ACESSO.md` |
| 4 — Rotas/APIs | 1 | 4 | 7 | 2 | 0 | `FASE-4-ROTAS.md` |
| 5 — Bugs/Qualidade | 3 | 8 | 7 | 1 | 1 | `FASE-5-QUALIDADE.md` |
| 6 — Acessibilidade | 0 | 7 | 6 | 0 | 3 | `FASE-6-ACESSIBILIDADE.md` |
| 7 — Boas práticas | 1 | 4 | 6 | 0 | 4 | `FASE-7-BOAS-PRATICAS.md` |

### 2.4 Ferramentas determinísticas

- **`tsc --noEmit`:** ✅ 0 erros.
- **`eslint`:** 0 erros, 9 warnings (4 imports/vars mortos; 6× `exhaustive-deps` faltando `apiBase`; **`phoneRegex` declarado e nunca aplicado** em `api/loja/leads`).
- **`npm audit`:** 14 vulnerabilidades — **1 alta** (`xlsx` SheetJS: Prototype Pollution + ReDoS, **sem patch**), 10 moderadas (`postcss`, `uuid`/mercadopago, next-auth beta→@auth/core/nodemailer), 3 baixas. Detalhe em `FASE-5-7-FERRAMENTAS.md`.

---

## 3. Tabela de achados confirmados (Crítico → Alto)

> Lista priorizada dos achados de maior risco já confirmados pela verificação adversarial ou pelo auditor. Lista completa (133) nos arquivos por fase.

| # | Severidade | arquivo:linha | Achado | Status |
|---|---|---|---|---|
| C1 | 🔴 Crítico | `src/app/api/admin/alunos/[id]/route.ts:138` | PATCH aluno sem `tenantId` (IDOR cross-tenant) | ✅ confirmado |
| C2 | 🔴 Crítico | `src/app/api/admin/alunos/[id]/bloquear/route.ts:23` | Bloqueio de aluno cross-tenant | ✅ confirmado |
| C3 | 🔴 Crítico | `src/app/api/admin/alunos/[id]/notify/route.ts:29` | Notificação cross-tenant | ✅ confirmado |
| C4 | 🔴 Crítico | `src/lib/students/management.ts:39` | `applyStudentEdit` sem `tenantId` | ✅ confirmado |
| C5 | 🔴 Crítico | `src/lib/students/management.ts:114` | `resetStudentPassword` sem `tenantId` (account takeover) | ✅ confirmado |
| C6 | 🔴 Crítico | `src/app/api/admin/certificates/issue/route.ts:36` | Emissão de certificado sem `tenantId` (fraude) | ✅ confirmado |
| C7 | 🔴 Crítico | `src/app/api/admin/certificates/[id]/download/route.ts:28` | Download de certificado cross-tenant | ✅ confirmado |
| C8 | 🔴 Crítico | `src/app/api/admin/certificates/[id]/regenerate/route.ts:23` | Regeneração de certificado cross-tenant | ✅ confirmado |
| C9 | 🔴 Crítico | `src/app/api/aluno/catalogo/route.ts:14` | Catálogo do aluno expõe `Course` global | ✅ confirmado |
| C10 | 🔴 Crítico | `src/lib/catalog/home.ts:284` | `loadShowcase`/`loadCurated`/... sem filtro de tenant | ✅ confirmado |
| H1 | 🟠 Alto | `src/app/api/admin/alunos/[id]/reset-password/route.ts:13` | Reset de senha cross-tenant | ✅ confirmado |
| H2 | 🟠 Alto | `src/lib/mercadopago/webhook.ts:19` | Webhook MP sem validação de timestamp (replay) | ✅ confirmado (era Crít.) |
| H3 | 🟠 Alto | `src/app/api/cobranca/[paymentId]/route.ts:7` | Enumeração de pagamentos (endpoint público) | ✅ confirmado |
| H4 | 🟠 Alto | `src/app/api/cobranca/[paymentId]/pay-card/route.ts:39` | Enumeração via `pay-card` (rate-limit 5/min) | ✅ confirmado |
| H5 | 🟠 Alto | `src/app/api/painel/vendas/route.ts:329-490` | Catch silencioso/rollback sem log em checkout de revenda | finder (não verif.) |
| H6 | 🟠 Alto | `src/lib/checkout/due-date.ts:6` | Bug de timezone (hora local em vez de UTC) | finder (não verif.) |
| H7 | 🟠 Alto | `src/lib/referrals/payout.ts:353` | Floating promise / erro engolido em payout | finder (não verif.) |
| H8 | 🟠 Alto | `src/app/api/admin/config/route.ts:37` | `process.env` direto sem validação central | finder (não verif.) |
| M→ | 🟡 Médio | `src/app/admin/layout.tsx:16` | 6 páginas `/admin` só protegidas no layout (sem guard próprio) | ✅ confirmado (rebaixado de Alto) |

> Correções de severidade pelo auditor: `proxy.ts:280` (x-tenant-id ausente em Redis miss) → **Baixo** (degradação graciosa, slug resolvido downstream); cron `cleanup-webhook-logs` → **falso positivo** (tem `isCronAuthorized`).

---

## 4. Detalhamento por fase

O detalhamento completo, com descrição, impacto, correção e trecho de cada um dos 133 achados, está nos arquivos:

- **`FASE-1-ARQUITETURA.md`** — panorama, stack, organização, config de segurança.
- **`FASE-2-SEGURANCA.md`** — 57 achados (isolamento tenant, privilégio, webhooks/crons, cripto, XSS/CSRF, IDOR, validação).
- **`FASE-3-ACESSO.md`** — 11 achados (matriz de papéis, proteção client-only, impersonation).
- **`FASE-4-ROTAS.md`** — 14 achados (erros, N+1, paginação, duplicação admin/painel).
- **`FASE-5-QUALIDADE.md`** — 20 achados (race/null, timezone, `any`, hooks, memory leaks).
- **`FASE-6-ACESSIBILIDADE.md`** — 16 achados (alt text, labels, ARIA, contraste, aninhamento `<Link>`).
- **`FASE-7-BOAS-PRATICAS.md`** — 15 achados (convenções Next 16, `<img>` vs next/image, env, logs).
- **`FASE-5-7-FERRAMENTAS.md`** — saída de `tsc`/`eslint`/`npm audit`.

### Destaques por fase (além dos críticos já listados)

**Fase 3 — Acesso:** 6 páginas `/admin` (analytics, banner, meu-perfil, revendedores, notificações, relatórios) dependem só do guard do `layout.tsx` — funciona hoje, mas é frágil (qualquer rota futura fora do layout fica exposta). As **APIs** que essas páginas consomem *estão* protegidas, então o risco é defesa-em-profundidade (Médio). Impersonation (`lib/auth/impersonate.ts`) tem backup de cookie e restauração — revisar trilha de auditoria.

**Fase 4 — Rotas:** duplicação significativa entre `/api/admin/*` e `/api/painel/*` (certificates, automacao, banner, home-sections, comunicacao quase idênticos) — oportunidade de extrair handlers compartilhados. N+1 em `admin/revendedores/[id]` (upsert sequencial de `TenantCourse`) e em `admin/automacao/templates` (self-heal). Catches silenciosos em `painel/vendas` escondem falhas de checkout.

**Fase 5 — Qualidade:** memory leaks por listeners não removidos (`onboarding-tour`, `notification-bell`), `fetch` em `useEffect` sem `AbortController` (`reseller-list-client`, `student-detail-drawer`), bug de timezone em `due-date.ts`, non-null assertions perigosos em `revendedores/[id]/billing`.

**Fase 6 — Acessibilidade (WCAG 2.1 AA):** imagens de herói/curso com `alt` vazio (`hero-slides`, `course-picker`), `<Link>` aninhado com `role="menuitem"` em `navbar-main`, `div` com `role="button"` sem suporte a teclado em `lead-kanban-column`, checkbox sem `id`/label em `login-form`, contraste insuficiente em placeholders/`hero-banner`.

**Fase 7 — Boas práticas:** `<img>` em vez de `next/image` (perda de otimização), `process.env` acessado direto em vários pontos sem passar por `src/lib/env.ts`, exposição de mensagens de erro de serviços externos (Asaas/domínio) ao cliente, `phoneRegex` morto sinalizando validação de telefone esquecida em `api/loja/leads`.

---

## 5. Plano de ação priorizado

### 🔴 Sprint 0 — Correções críticas de isolamento (fazer primeiro)

1. **Refatorar `src/lib/students/management.ts`** (`applyStudentEdit`, `resetStudentPassword`, e congêneres) para **exigir `tenantId` como parâmetro** e filtrar `where:{id, tenantId}`. Conserta C4, C5, H1 e fecha os chamadores admin/painel de uma vez. *(maior alavanca)*
2. **Padronizar toda a família `/api/admin/alunos/[id]/*`** para usar `findFirst({where:{id, tenantId: pmbTenant.id}})` nas mutações (igual ao `GET`). Conserta C1, C2, C3 e os irmãos `desbloquear`/`cursos`.
3. **Escopar certificados** (`issue`, `[id]/download`, `[id]/regenerate`): validar `enrollment.tenantId` / `certificate.tenantId` contra a sessão. Conserta C6, C7, C8.
4. **Filtrar catálogo por tenant**: trocar `Course.findMany` por `TenantCourse` + `visibilityFilter(tenantId)` em `aluno/catalogo` e `lib/catalog/home.ts` (`loadShowcase` e cia.). Conserta C9, C10. (Já existe `listTenantCourses()` — reusar.)
5. **Webhook MP**: validar `x-request-id`/timestamp e janela de tolerância para impedir replay (H2). **Cobrança**: endurecer `/api/cobranca/[paymentId]` e `pay-card` (rate-limit por IP+ID, resposta genérica) contra enumeração (H3, H4).

> **Defesa em profundidade (recomendado após Sprint 0):** avaliar **RLS no Postgres** com `SET app.tenant_id` por request, ou um **Prisma Client Extension** que injete `tenantId` automaticamente nas queries de vitrine. Isso transforma "esquecer o filtro" de vulnerabilidade em erro inofensivo.

### 🟠 Sprint 1 — Altos

6. Eliminar catches silenciosos / rollback sem log em `painel/vendas` (H5) — risco de venda inconsistente sem rastro.
7. Corrigir bug de timezone em `lib/checkout/due-date.ts` (H6) e floating promise em `referrals/payout.ts` (H7).
8. Centralizar acesso a env via `src/lib/env.ts` (H8, Fase 7) e parar de vazar erros de serviços externos ao cliente.
9. Adicionar guard server-side próprio às 6 páginas `/admin` (defesa em profundidade) e revisar trilha de impersonation.
10. **Dependências:** confirmar que `xlsx` só *gera* (write) e nunca *lê* upload de usuário; planejar troca por `exceljs`. Rodar `npm audit fix` (sem `--force`).

### 🟡 Sprint 2 — Médios e qualidade

11. Memory leaks (remover listeners), `AbortController` nos `fetch` de `useEffect`, non-null assertions.
12. Acessibilidade WCAG: `alt` text, labels/ids, `role`/teclado, contraste, corrigir aninhamento de `<Link>`.
13. Extrair handlers duplicados admin/painel; corrigir N+1 (transação/`createMany`).
14. Limpar imports/vars mortos; aplicar (ou remover) o `phoneRegex` em `loja/leads`.

### 🔵 Backlog

15. CSP por nonce (remover `unsafe-inline`/`unsafe-eval`); migrar `<img>`→`next/image`; remover scaffolds duplicados do repo; revisar warnings `exhaustive-deps`.

---

## 6. Observações de método e limitações

- **`npm run build` não foi executado** de propósito (o script roda `db:apply-pending`, que aplica migrations no banco real). Recomenda-se rodar o build num ambiente isolado/CI com `DATABASE_URL` de staging.
- Dos 56 achados Crítico/Alto, **24 passaram por verificação adversarial**; os demais vêm dos finders e estão marcados como *"não verificado"* na tabela e nos arquivos de fase — priorize confirmar os de família já validada (IDOR) e trate os isolados (timezone, payout, env) com a confiança do finder.
- Um finder (cobertura de autenticação) não retornou saída estruturada; a lacuna foi **coberta manualmente**: varredura das rotas mutáveis `admin`/`painel` sem helper mostrou apenas rotas que usam `auth()` inline (válidas), 2 stubs descontinuados (410) e 1 endpoint de impersonation legítimo — **nenhum gap de autenticação real**. Os problemas de acesso são de **autorização** (filtro `tenantId`), não de autenticação.
- Nenhuma correção de código foi aplicada nesta etapa, conforme solicitado. Aguardo autorização para iniciar pelo **Sprint 0**.
