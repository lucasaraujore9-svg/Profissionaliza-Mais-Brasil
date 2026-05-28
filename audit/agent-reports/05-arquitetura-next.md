# Relatório de Arquitetura Next.js / Full-stack
**Agente:** 05 — Arquitetura Next.js  
**Data:** 2026-05-28  
**Referência:** ISO/IEC 25010 (manutenibilidade, modularidade, reusabilidade, analisabilidade)

---

## 1. Inventário Quantitativo

| Métrica | Valor |
|---|---|
| Route handlers (`route.ts`) | 200 |
| Páginas (`page.tsx`) | 108 |
| Componentes | 253 |
| Libs (`src/lib/**`) | 107 arquivos |
| `"use client"` declarados | 179 |
| `as unknown as` / `@ts-ignore` | 12 ocorrências |
| Server Actions (`"use server"`) | 2 arquivos |
| Testes automatizados | 0 |

---

## 2. Achados

---

### [Médio] PMB_RESELLER_MGR pode mudar status / policy / billing de revendedores que não gerencia
- **Agente responsável:** Arquitetura Next.js
- **Categoria:** Autorização, Isolamento multi-role
- **Arquivos:**
  - `src/app/api/admin/revendedores/[id]/status/route.ts:15`
  - `src/app/api/admin/revendedores/[id]/policy/route.ts:24`
  - `src/app/api/admin/revendedores/[id]/comissoes/export/route.ts:51`
- **Linha/trecho:**  
  `const ctx = await requireAdminSession()` — sem verificação subsequente de `accountManagerId`.
- **Evidência:**  
  As rotas `/[id]/route.ts` (GET/PATCH) e `/[id]/comissoes/demonstrativo/route.ts` fazem corretamente: `if (ctx.role === "PMB_RESELLER_MGR" && tenant.accountManagerId !== ctx.userId) return 403`. As três rotas acima omitem essa verificação, aceitando qualquer membro da equipe PMB.
- **Descrição:** `requireAdminSession` aceita os três roles internos (`SUPER_ADMIN`, `PMB_SALES`, `PMB_RESELLER_MGR`). Os sub-handlers de `status`, `policy` e `comissoes/export` não implementam o filtro de `accountManagerId` que as rotas irmãs implementam.
- **Impacto:** Um gerente de revendedor (`PMB_RESELLER_MGR`) pode suspender, alterar a política de cobrança ou exportar comissões de um tenant que não é seu — violação do controle de acesso baseado em escopo de conta.
- **Cenário de risco:** Gerente de região A logado faz `PATCH /api/admin/revendedores/<id_regiao_B>/status` com `{ status: "SUSPENDED" }` — sem erro, tenant B suspenso.
- **Recomendação:** Adicionar verificação `if (ctx.role === "PMB_RESELLER_MGR" && tenant.accountManagerId !== ctx.userId) return 403` nas três rotas, copiando o padrão de `[id]/route.ts:39`.
- **Correção aplicada:** Não
- **Status:** Recomendado
- **Confiança:** Alta

---

### [Médio] Função `dueDateInDays` duplicada em 3 route handlers sem extração para lib
- **Agente responsável:** Arquitetura Next.js
- **Categoria:** Reusabilidade, manutenibilidade
- **Arquivos:**
  - `src/app/api/checkout/route.ts:93`
  - `src/app/api/aluno/comprar/route.ts:26`
  - `src/app/api/admin/vendas/route.ts:76`
- **Linha/trecho:** Três definições idênticas de `function dueDateInDays(days: number): string`.
- **Evidência:** `grep -rn "function dueDateInDays"` retorna 3 hits em arquivos de rota diferentes.
- **Descrição:** Lógica de cálculo de data de vencimento (usada em criação de cobranças Asaas) está copiada verbatim em 3 routes. Se a regra mudar (ex.: hora UTC vs local), precisará ser alterada em 3 lugares.
- **Impacto:** Divergência silenciosa de comportamento se um dos três for atualizado e os outros esquecidos.
- **Cenário de risco:** Bug introduzido em `checkout/route.ts` corrigido, mas `aluno/comprar/route.ts` continua com comportamento antigo.
- **Recomendação:** Extrair para `src/lib/utils/date.ts` e importar nos 3 routes.
- **Correção aplicada:** Não
- **Status:** Recomendado
- **Confiança:** Alta

---

### [Médio] Função `normalizeE164` duplicada em 2 rotas e 1 lib sem reuso
- **Agente responsável:** Arquitetura Next.js
- **Categoria:** Reusabilidade
- **Arquivos:**
  - `src/app/api/pmb/leads/route.ts:31`
  - `src/app/api/loja/leads/route.ts:33`
  - `src/lib/automation/leads.ts:238` (implementação canônica existe aqui, mas não é importada)
- **Evidência:** `grep -rn "normalizeE164"` retorna 3 definições independentes.
- **Descrição:** `src/lib/automation/leads.ts` já possui `normalizeE164` como função privada. As duas rotas a reimplementam em vez de importar de um utilitário compartilhado.
- **Impacto:** Três implementações podem divergir; comportamento diferente para leads PMB vs loja.
- **Recomendação:** Exportar `normalizeE164` de `src/lib/validation/phone.ts` (já existe `normalizePhone` ali, que é similar) e remover as cópias locais.
- **Correção aplicada:** Não
- **Status:** Recomendado
- **Confiança:** Alta

---

### [Médio] Interface `TenantContext` definida duas vezes com shapes divergentes
- **Agente responsável:** Arquitetura Next.js
- **Categoria:** Modularidade, analisabilidade
- **Arquivos:**
  - `src/lib/enrollment/fulfill.ts:40` — `export interface TenantContext`
  - `src/lib/mercadopago/process.ts:39` — `interface TenantContext` (privada)
- **Evidência:**
  - `fulfill.ts`: `{ id, slug, plataformaVendedorId, isPmbVitrine?, name? }`
  - `process.ts`: `{ id, name, slug, plataformaVendedorId, mpAccessToken, primaryColor, isPmbVitrine? }`
- **Descrição:** Dois tipos com o mesmo nome e propósito conceptual diferem em campos (`mpAccessToken`, `primaryColor` em `process.ts` mas não em `fulfill.ts`; `name` obrigatório em `process.ts`, opcional em `fulfill.ts`). O `process.ts` mapeia de um para o outro internamente, criando conversão implícita.
- **Impacto:** Desenvolvedor novo confunde as duas interfaces; mudança em uma não propaga para a outra.
- **Recomendação:** Criar `src/lib/tenant/context.ts` com a interface canônica e adaptar ambos os módulos.
- **Correção aplicada:** Não
- **Status:** Recomendado
- **Confiança:** Alta

---

### [Médio] `getSystemSettings` sem cache — hit ao banco em cada request de checkout
- **Agente responsável:** Arquitetura Next.js
- **Categoria:** Performance, analisabilidade
- **Arquivo:** `src/lib/system-settings.ts:14`
- **Linha/trecho:** `getSystemSettings()` executa `prisma.systemSettings.upsert` a cada chamada; chamada em 10+ rotas.
- **Evidência:** `grep -rn "getSystemSettings" src/app/api` retorna 10 ocorrências incluindo `checkout/route.ts:130`, `aluno/comprar/route.ts:56`, `admin/vendas/route.ts:104`.
- **Descrição:** Configurações globais (`pmbDirectSaleGateway`, `pmbMpAccessTokenEnc`) raramente mudam mas são lidas a cada transação de checkout. Não há `unstable_cache`, Redis ou TTL.
- **Impacto:** N+1 de queries em volume de tráfego; latência adicionada no caminho crítico de venda.
- **Cenário de risco:** Em pico de Black Friday, cada checkout faz uma query extra desnecessária.
- **Recomendação:** Adicionar cache Redis com TTL de 5min via `src/lib/redis` (pattern já existente em `src/lib/redis/tenant-cache.ts`). Invalidar no `updatePmbDirectSaleGateway` / `updatePmbMpAccessToken`.
- **Correção aplicada:** Não
- **Status:** Recomendado
- **Confiança:** Alta

---

### [Médio] Schema Zod de aluno (`nome/email/cpf/fone`) redefinido em 4 route handlers
- **Agente responsável:** Arquitetura Next.js
- **Categoria:** Reusabilidade, manutenibilidade
- **Arquivos:**
  - `src/app/api/checkout/route.ts:61` (`bodySchema`)
  - `src/app/api/loja/checkout/route.ts:20` (`bodySchema`)
  - `src/app/api/painel/vendas/route.ts:18` (`createSchema`)
  - `src/app/api/admin/alunos/route.ts:78` (`createSchema` — parcialmente diferente: `cpf` usa `.min(11).max(14)` em vez de `refine(isValidCpf)`)
- **Evidência:** Campos `nome/email/cpf/fone` com validações `isValidCpf` + `stripCpf` + `isValidPhone` + `normalizePhone` presentes em cada arquivo.
- **Descrição:** O único schema centralizado é `src/lib/schemas/revendedor-cadastro.ts` (onboarding de revendedor). Schemas de aluno estão todos inline. `admin/alunos/route.ts` usa validação menos rigorosa de CPF (`z.string().min(11).max(14)` sem `refine(isValidCpf)` na schema — chamando `isValidCpf` manualmente depois), criando inconsistência.
- **Impacto:** CPF inválido pode passar pelo schema de admin e ser rejeitado só no `isValidCpf` manual em linha 106 — comportamento diferente dos outros endpoints; schemas divergem silenciosamente.
- **Recomendação:** Criar `src/lib/schemas/aluno.ts` com `alunoSchema` e importar nos 4 routes.
- **Correção aplicada:** Não
- **Status:** Recomendado
- **Confiança:** Alta

---

### [Médio] Páginas admin fazem role check inline em vez de usar guards
- **Agente responsável:** Arquitetura Next.js
- **Categoria:** Consistência, segurança de UI
- **Arquivos:**
  - `src/app/admin/financeiro/page.tsx:7–11`
  - `src/app/admin/automacao/page.tsx` (role check inline)
  - `src/app/admin/leads/page.tsx`
  - `src/app/admin/vendas/page.tsx`
  - `src/app/(auth)/login/page.tsx:12`
- **Linha/trecho:**
  ```ts
  // financeiro/page.tsx:8
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!role || !["SUPER_ADMIN", "PMB_SALES", "PMB_RESELLER_MGR"].includes(role)) {
    redirect("/login")
  }
  ```
- **Evidência:** `grep -rln "session.*role" src/app --include="page.tsx"` retorna 14 arquivos com role checks manuais.
- **Descrição:** `src/lib/auth/guards.ts` oferece helpers canônicos (`requirePmbTeam`, `requireSuperAdmin`, etc.) retornando `{ ok, session | response }`. Várias pages.tsx fazem o role check manualmente com type casts (`as { role?: string }`), duplicando a lógica e ignorando o tipo centralizado em `src/types/index.ts`.
- **Impacto:** Se a lista de roles PMB mudar, 14+ páginas precisam ser atualizadas; o cast manual cria risco de uso em contexto errado.
- **Recomendação:** Criar `requirePmbTeamPage` / `requireSuperAdminPage` em `src/lib/auth/guards.ts` que retornem `redirect()` diretamente (Server Component variant), e usar em páginas.
- **Correção aplicada:** Não
- **Status:** Recomendado
- **Confiança:** Alta

---

### [Baixo] `PMB_TEAM` array definido duas vezes em arquivos separados
- **Agente responsável:** Arquitetura Next.js
- **Categoria:** Modularidade, DRY
- **Arquivos:**
  - `src/lib/auth/guards.ts:11` — `const PMB_TEAM: UserRole[] = ["SUPER_ADMIN", "PMB_SALES", "PMB_RESELLER_MGR"]`
  - `src/lib/auth/admin-session.ts:11` — idem
- **Evidência:** `grep -rn "const PMB_TEAM" src/lib/auth/` retorna 2 hits idênticos.
- **Descrição:** Dois arquivos mantêm a mesma constante localmente. Se um novo role PMB for adicionado, é necessário atualizar ambos.
- **Recomendação:** Exportar `PMB_TEAM` de `guards.ts` (ou de um novo `src/lib/auth/roles.ts`) e importar em `admin-session.ts`.
- **Correção aplicada:** Não
- **Status:** Recomendado
- **Confiança:** Alta

---

### [Baixo] `useEffect + fetch` em ~15 componentes admin — padrão aceitável dado App Router, mas sem SWR/React Query
- **Agente responsável:** Arquitetura Next.js
- **Categoria:** Data fetching, manutenibilidade
- **Arquivos (amostra):**
  - `src/components/admin/admin-analytics-client.tsx:52`
  - `src/components/admin/financeiro-tenant-payments.tsx:143`
  - `src/components/admin/reseller-list-client.tsx:44`
  - `src/components/admin/reports-client.tsx:40`
  - `src/components/admin/financeiro-referral-payouts.tsx:169`
- **Linha/trecho:**
  ```ts
  // admin-analytics-client.tsx:32–55
  const [data, setData] = useState<AnalyticsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { load(period) }, [load, period])
  ```
- **Evidência:** Padrão `useState([data, loading, error]) + useEffect(fetch)` presente em 15+ componentes admin.
- **Descrição:** O padrão está correto para componentes interativos (filtros, período, paginação controlados pelo usuário). Não há erro lógico. Porém, sem biblioteca de data fetching, cada componente reimplementa: loading state, error state, deduplica requests manualmente, sem cache, sem refetch on focus.
- **Impacto:** Código verbose repetido; sem cache de cliente (usuário navega de volta e recarrega tudo); sem retry automático.
- **Recomendação (fase futura):** Adotar SWR ou TanStack Query para queries com parâmetros dinâmicos. Para dados estáticos de servidor (sem interação), considerar migrar para Server Component com Suspense.
- **Correção aplicada:** Não
- **Status:** Recomendado / fase futura
- **Confiança:** Alta

---

### [Baixo] Componentes gigantes acima de 500 linhas com múltiplas responsabilidades
- **Agente responsável:** Arquitetura Next.js
- **Categoria:** Manutenibilidade, analisabilidade
- **Arquivos:**
  - `src/components/painel/certificate-template-editor.tsx` — 1196 linhas
  - `src/components/loja/pmb-checkout-form.tsx` — 815 linhas
  - `src/components/admin/catalog-edit-drawer.tsx` — 745 linhas
  - `src/app/cobranca/[paymentId]/checkout-client.tsx` — 690 linhas
  - `src/components/admin/financeiro-referral-payouts.tsx` — 645 linhas
- **Evidência:** `find src -name "*.tsx" -exec wc -l {} + | sort -rn | head -10`
- **Descrição:** `certificate-template-editor.tsx` tem 1196 linhas cobrindo state de formulário, preview de certificado, upload de template e lógica de drag-and-drop. `pmb-checkout-form.tsx` tem 815 linhas cobrindo 3 métodos de pagamento (PIX, boleto, cartão) com estado e UI inlinados.
- **Impacto:** Alta carga cognitiva; dificulta testes unitários; múltiplas razões de mudança.
- **Recomendação:** Decompor em subcomponentes por método de pagamento, seção de formulário ou step de wizard. Não é urgente mas bloqueante para adição de novos métodos.
- **Correção aplicada:** Não
- **Status:** Recomendado / fase futura
- **Confiança:** Alta

---

### [Baixo] Route handlers checkout (`/api/checkout` e `/api/loja/checkout`) com 711 e 430 linhas — lógica de negócio inline
- **Agente responsável:** Arquitetura Next.js
- **Categoria:** Analisabilidade, manutenibilidade
- **Arquivos:**
  - `src/app/api/checkout/route.ts` — 711 linhas
  - `src/app/api/aluno/comprar/route.ts` — 443 linhas
  - `src/app/api/painel/vendas/route.ts` — 413 linhas
- **Evidência:** `find src/app/api -name "route.ts" | xargs wc -l | sort -rn | head -5`
- **Descrição:** Os 3 checkouts (PMB vitrine, aluno compra direta, painel revendedor) são variantes do mesmo fluxo: validar dados → upsertStudent → decidir gateway (MP vs Asaas) → criar preferência/cobrança → consumir cupom. Cada um reimplementa o fluxo inline no handler, com ~60% de lógica idêntica.
- **Impacto:** Bug corrigido em um checkout precisa ser replicado manualmente nos outros dois; `checkout/route.ts` (711 linhas) viola SRP.
- **Recomendação:** Extrair um `src/lib/checkout/create.ts` com `createCheckout(ctx: CheckoutContext)` parametrizado por tenant/gateway/tipo. Os 3 routes passam a ser wrappers finos de validação + delegação.
- **Correção aplicada:** Não
- **Status:** Recomendado
- **Confiança:** Alta

---

### [Baixo] Leads duplicados: 3 rotas com 155, 170 e 185 linhas e ~70% de lógica compartilhada
- **Agente responsável:** Arquitetura Next.js
- **Categoria:** Reusabilidade
- **Arquivos:**
  - `src/app/api/leads/route.ts` — 155 linhas (landing PMB)
  - `src/app/api/pmb/leads/route.ts` — 170 linhas (vitrine PMB)
  - `src/app/api/loja/leads/route.ts` — 185 linhas (vitrine revendedor)
- **Evidência:** Schema Zod similar nos três; `normalizeE164` duplicada nos dois últimos.
- **Descrição:** Os três registram leads com schemas levemente diferentes mas fluxo idêntico: validar → rate limit → upsertLead → enviar email → notificar. Diferença real: `tenantId` (null vs ID real).
- **Recomendação:** Extrair `src/lib/leads/capture.ts` e parametrizar por contexto (PMB vs revendedor).
- **Correção aplicada:** Não
- **Status:** Recomendado / fase futura
- **Confiança:** Média

---

### [Informativo] Zustand declarado como dependência mas sem nenhum store em uso
- **Agente responsável:** Arquitetura Next.js
- **Categoria:** Código morto, dependências
- **Arquivo:** `package.json`
- **Evidência:** `grep -rn "from 'zustand'" src/` → 0 resultados. `grep -rn "zustand"` → 0.
- **Descrição:** `package.json` lista `zustand` como dependência (conforme CLAUDE.md), mas não há nenhum arquivo `src/stores/*.ts` nem import de `zustand` no código-fonte. Todo estado está em `useState` local nos Client Components.
- **Impacto:** +7.4kB no bundle sem uso. `CLAUDE.md` menciona Zustand como stack confirmada — indica drift entre documentação e implementação real.
- **Recomendação:** Remover de `package.json` se de fato não usado, ou criar stores para estado compartilhado (sessão de impersonation, preferências de filtro globais).
- **Correção aplicada:** Não
- **Status:** Requer decisão humana
- **Confiança:** Alta

---

### [Informativo] `src/lib/schemas/` e `src/lib/validation/` — dois diretórios de validação com propósitos diferentes mas potencialmente confusos
- **Agente responsável:** Arquitetura Next.js
- **Categoria:** Organização, analisabilidade
- **Arquivos:**
  - `src/lib/schemas/revendedor-cadastro.ts` — 1 arquivo: schema Zod de onboarding
  - `src/lib/validation/cpf.ts` + `phone.ts` — helpers de validação pura (sem Zod)
- **Evidência:** `ls src/lib/schemas/ src/lib/validation/`
- **Descrição:** Os diretórios têm propósitos distintos (`schemas/` = objetos Zod completos; `validation/` = funções puras), o que é defensável. Porém há apenas 1 arquivo em `schemas/` — todos os outros schemas Zod estão inline nas rotas. A split sugere intenção de centralizar, não concluída.
- **Recomendação:** Consolidar schemas de aluno/cupom/checkout em `src/lib/schemas/` para completar o padrão iniciado.
- **Correção aplicada:** Não
- **Status:** Recomendado / fase futura
- **Confiança:** Alta

---

### [Informativo] `revalidatePath`/`revalidateTag` ausentes — cache coherence depende inteiramente de `force-dynamic`
- **Agente responsável:** Arquitetura Next.js
- **Categoria:** Cache strategy, analisabilidade
- **Evidência:** `grep -rn "revalidatePath\|revalidateTag" src/` → 0 resultados. 24 usos de `force-dynamic`.
- **Descrição:** Toda a plataforma usa API Routes (não Server Actions), portanto não há Server Action invocando `revalidatePath`. O mecanismo de cache Next.js não é usado para dados de app — fetches client-side usam `cache: "no-store"`. Isso é coerente com a arquitetura escolhida (SPA-in-shell), mas significa que não há benefício do Next.js Data Cache para nenhum dado de app. `unstable_cache` também não é usada.
- **Impacto:** Sem cache de app-layer; cada request ao servidor vai ao banco. Para dados que mudam raramente (catálogo, configurações), há oportunidade de melhoria.
- **Recomendação:** Avaliar `unstable_cache` com `revalidate` em TTL para: catálogo de cursos, system settings, tenant config (já em Redis para proxy, mas não para SSR de páginas).
- **Correção aplicada:** Não
- **Status:** Recomendado / fase futura
- **Confiança:** Alta

---

## 3. Avaliação Arquitetural Geral

### Pontos fortes

1. **Separação de camadas está presente e funcional.** Routes chamam libs de domínio (`src/lib/enrollment/fulfill.ts`, `src/lib/students/upsert.ts`, `src/lib/mercadopago/process.ts`). Não há lógica de negócio crítica inline diretamente nas pages.
2. **Padrão fat server / thin client respeitado.** 179 `"use client"` de 253 componentes é alto mas justificado: a maioria são formulários interativos admin, drawers, tabelas com filtros. Apenas 2 pages.tsx têm `"use client"` direto — `logout` e `alterar-senha-inicial`.
3. **Guards centralizados existem** e são usados em 68 routes (`requireSuperAdmin`) + 19 (`requirePmbSales`). O padrão `{ ok, session } | { ok, response }` é consistente nas API routes.
4. **TypeScript quase limpo:** apenas 12 ocorrências de `as unknown as` / `@ts-ignore`, nenhum `: any` encontrado. 8 dos 12 são necessários (interop com Prisma JSON, NextAuth session shape).
5. **Observabilidade integrada:** `withRequestContext` / `withRequestContextParams` wrappers em quase todos os handlers — padrão consistente.
6. **Idempotência corretamente implementada** em `fulfill.ts` com advisory lock Postgres.

### Pontos frágeis

1. **Inconsistência entre `requireAdminSession` e guards com escopo** — 3 sub-rotas de revendedor aceitam qualquer PMB_TEAM sem verificar `accountManagerId`.
2. **Lógica de checkout 3x duplicada** nos maiores route handlers do projeto (711 + 443 + 413 linhas).
3. **Schemas Zod inline** em ~20+ routes com intenção de centralizar nunca concluída — `src/lib/schemas/` tem 1 arquivo.
4. **`getSystemSettings` sem cache** no caminho crítico de checkout.
5. **Zustand declarado mas não usado** — drift entre documentação e código real.

---

## 4. Arquitetura-Alvo

```
src/lib/
  checkout/
    create.ts          ← lógica unificada de checkout (MP + Asaas)
  schemas/
    aluno.ts           ← schema Zod de aluno (nome/email/cpf/fone)
    checkout.ts        ← schema Zod de checkout
    revendedor-cadastro.ts  (já existe)
  auth/
    roles.ts           ← PMB_TEAM e constantes de role (importado por guards + admin-session)
  tenant/
    context.ts         ← TenantContext canônico (importado por fulfill + process)
  leads/
    capture.ts         ← lógica unificada de lead capture
  utils/
    date.ts            ← dueDateInDays, isoDayPlus
```

---

## 5. Refatorações

### (a) Seguras / imediatas

| Ação | Risco | Esforço |
|---|---|---|
| Extrair `PMB_TEAM` para `roles.ts` e importar em `guards.ts` + `admin-session.ts` | Nenhum | 15min |
| Extrair `dueDateInDays` para `src/lib/utils/date.ts` | Nenhum | 20min |
| Exportar `normalizeE164` de `src/lib/validation/phone.ts` e remover cópias locais | Nenhum | 20min |
| Adicionar cache Redis para `getSystemSettings` com invalidação nos updates | Baixo | 1h |
| Adicionar verificação `accountManagerId` em `status/`, `policy/`, `comissoes/export/` | Baixo | 30min |

### (b) Recomendadas / fase futura

| Ação | Risco | Esforço |
|---|---|---|
| Criar `src/lib/schemas/aluno.ts` e unificar 4 schemas de rota | Médio (testar todos os checkouts) | 2h |
| Extrair `src/lib/checkout/create.ts` com lógica unificada | Alto (caminho crítico) | 1 dia |
| Criar variantes de guards para páginas (Server Component) | Baixo | 1h |
| Decompor `certificate-template-editor.tsx` (1196 linhas) | Médio | 4h |
| Adotar SWR/TanStack Query para data fetching em Client Components | Alto (migração incremental) | 2 dias |
| Criar `TenantContext` canônico em `src/lib/tenant/context.ts` | Médio | 1h |
| Remover `zustand` de `package.json` (ou criar stores de fato) | Baixo | 15min |
