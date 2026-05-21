# Workflow de Desenvolvimento — Processo SPEC→BREAK→PLAN→EXECUTE

Este documento descreve o fluxo de trabalho que TODO agente/skill DEVE seguir para implementar features no Profissionaliza Mais Brasil.

---

## Resumo do Processo

Toda feature passa por 4 fases sequenciais:

| Fase | Quem | O que | Deliverable |
|------|------|-------|-------------|
| **SPEC** | Product/Designer | Detalhar *o que* build | `docs/SPEC.md` |
| **BREAK** | Product | Splittar em tarefas pequenas | `issues/` (um arquivo por task) |
| **PLAN** | Dev (Claude) | Pesquisar + ler docs + planejar | Comments no issue ou anotações |
| **EXECUTE** | Dev (Claude) | Codificar seguindo o plano | Code committed |

---

## Fase 1: SPEC (Especificação)

**Responsabilidade:** Documentar o QUÊ será construído, sem entrar em detalhes técnicos.

### O que Incluir em `docs/SPEC.md`

```markdown
# SPEC: Nome da Feature

## Descrição
Descrição clara do que será construído e por quê.

## Atores Envolvidos
- Revendedor
- Aluno
- Admin Master
- (etc)

## User Stories
- Como [ator], eu quero [ação], para que [benefício]
- Como revendedor, eu quero visualizar meus pedidos, para acompanhar vendas

## Fluxos de Usuário
### Fluxo 1: Criar Curso
1. Revendedor clica em "Novo Curso"
2. Abre modal com formulário
3. Preenche: nome, descrição, preço, imagem
4. Clica "Criar"
5. Curso aparece na lista

## Protótipos / Screenshots
[Links para Figma, Stitch, ou screenshots]

## Casos de Sucesso
- Revendedor cria curso com sucesso
- Aluno vê novo curso na vitrine

## Casos de Erro
- Preço inválido
- Imagem muito grande
- Conexão perdida

## Dependências
- Feature X precisa estar pronta
- API Y disponível
```

### Exemplo Real

```markdown
# SPEC: Dashboard de Vendas Revendedor

## Descrição
Painel que mostra ao revendedor um resumo em tempo real de suas vendas:
total de receita, número de pedidos, alunos matriculados, e um gráfico
de vendas dos últimos 30 dias.

## Atores
- Revendedor (visualiza seus dados)

## User Stories
- Como revendedor, eu quero ver minha receita total, para saber meu faturamento
- Como revendedor, eu quero ver quantos alunos tenho, para acompanhar crescimento
- Como revendedor, eu quero ver um gráfico de vendas, para entender trends

## Fluxo Principal
1. Revendedor faz login
2. Clica em "Dashboard" na sidebar
3. Vê cards de KPIs (receita, pedidos, alunos, conversão)
4. Vê gráfico de vendas (últimos 30 dias)
5. Pode clicar em "Ver Detalhes" para drill-down

## Protótipos
[Link Stitch: design/dashboard-revendedor]

## Dependências
- Feature: Authentication (já pronta)
- Feature: Orders CRUD (já pronta)
- API: Mercado Pago webhooks (precisa estar funcionando)
```

---

## Fase 2: BREAK (Quebra em Tarefas)

**Responsabilidade:** Dividir a feature em tarefas pequenas, focadas, com dependências claras.

### Estrutura de Issue File

Cada task é um arquivo em `issues/` com nome descritivo:

```
issues/
├── 2025-01-15-auth-login-form.md
├── 2025-01-15-auth-password-reset.md
├── 2025-01-20-dashboard-load-data.md
├── 2025-01-20-dashboard-ui-layout.md
├── 2025-01-20-dashboard-charts.md
└── 2025-01-22-dashboard-integration-mp.md
```

### Template de Issue

```markdown
# Issue: [Número] — Nome Descritivo

## Task
Uma linha clara: "Implementar carrinho de compras"

## Descrição
Contexto breve do que vai ser feito e por quê.

## Aceitação (AC)
- [ ] AC1: Usuário pode adicionar item ao carrinho
- [ ] AC2: Carrinho persiste mesmo após página recarregar
- [ ] AC3: Responsivo em mobile, tablet, desktop
- [ ] AC4: Mostra total e quantidade de itens
- [ ] AC5: Botão "Finalizar Compra" leva para checkout

## Escopo
- Componente ClientCart.tsx
- Hook useCart (Zustand)
- POST /api/painel/add-to-cart (server action)
- Sem integração com Mercado Pago (outra task)

## Dependências
- Precisa de: Auth (pronta)
- Bloqueada por: Nenhuma

## Notas
- Usar Zustand para state (não Context)
- Dados salvos no localStorage + Zustand
- Validar tenant_id em todo acesso à BD
- Testado em responsivo antes de marcar como done

## Arquivo de Referência
Após pronto, verificar:
- docs/references/architecture.md (padrões)
- docs/references/design-system.md (UI)
- docs/references/workflow.md (este)
```

### Exemplo Real de Issue

```markdown
# Issue: 001 — Dashboard: Load KPI Data

## Task
Implementar server action que carrega KPIs (receita, pedidos, alunos, conversão)
para o dashboard do revendedor.

## Descrição
A tela do dashboard precisa de dados real-time de vendas. Esta task foca APENAS
em carregar os números do banco de dados. A UI vem em outra task.

## Aceitação
- [ ] Server action loadDashboardKPIs() retorna dados corretos
- [ ] Filtra por tenant_id da sessão
- [ ] Calcula receita dos últimos 30 dias
- [ ] Conta alunos matriculados (no BD)
- [ ] Conta pedidos aprovados (no BD)
- [ ] Trata erros e logged
- [ ] Retorna em < 1s (sem N+1 queries)

## Escopo
- Arquivo: src/app/painel/dashboard/load-kpis.ts (server action)
- Query: Prisma orders, users, pagamentos filtrando por tenant_id
- Sem UI, sem frontend

## Dependências
- Precisa de: Auth + getCurrentTenant() (pronta)
- Bloqueada por: Nenhuma

## Notas
- Receita = SUM(orders.price) WHERE status='approved' AND data >= 30 dias atrás
- Alunos = COUNT(DISTINCT users) WHERE tenant_id=X AND status='active'
- Pedidos = COUNT(orders) WHERE tenant_id=X AND status='approved'
- Conversão = pedidos / visitas (métrica futura, por enquanto hardcoded)
```

### Boas Práticas de BREAK

1. **Uma task = Uma responsabilidade**
   - ❌ "Implementar dashboard com dados e UI"
   - ✅ "Implementar server action para carregar KPIs"
   - ✅ "Criar layout + cards de KPIs"

2. **Respeitador de dependências**
   ```
   Task 1: Load data (no UI)
      ↓
   Task 2: Basic UI (static/hardcoded data)
      ↓
   Task 3: Connect UI to real data
   ```

3. **Testável em isolamento**
   - Task "add to cart" deve poder ser testada sem checkout

4. **Estimativa clara**
   - Pequeno = 1-2h de trabalho
   - Médio = 2-4h
   - Grande = split em mais tasks

---

## Fase 3: PLAN (Planejamento)

**Responsabilidade do Dev (Claude):** Antes de codificar, pesquisar, ler docs e planejar.

### Checklist de PLAN

Ao pegar um issue, fazer esto NA ORDEM:

1. **Ler o arquivo de issue** completamente
2. **Ler documentos de referência:**
   - `docs/references/architecture.md` (padrões)
   - `docs/references/design-system.md` (UI)
   - Partes relevantes de `docs/architecture/*.md`
3. **Pesquisar código existente** (Grep)
   - Componentes similares
   - Server actions similares
   - API routes similares
4. **Planejar mentalmente ou em pseudo-code:**
   - Quais arquivos preciso criar/editar?
   - Qual é a estrutura de dados?
   - Quais são os passos do código?
   - Quais são os edge cases?
5. **Executar** (próxima fase)

### Exemplo de PLAN

Para issue "Dashboard: Load KPI Data":

```
Arquivo de Issue:
  ✅ Lido — preciso loadDashboardKPIs(), filtra por tenant_id

Documentos de Referência:
  ✅ architecture.md — confirma: Server Action, getCurrentTenant(), Prisma queries
  ✅ design-system.md — não relevante (sem UI)

Pesquisa no Código:
  ✅ Grep por "server action" — vejo patterns em src/app/painel/cursos/load-cursos.ts
  ✅ Grep por "getCurrentTenant" — vejo uso correto em vários arquivos
  ✅ Grep por "prisma.order" — vejo queries de orders

Pseudo-código:
  1. Criar arquivo src/app/painel/dashboard/load-kpis.ts
  2. Função async loadDashboardKPIs() com "use server"
  3. Chamar getCurrentTenant() (pega tenant_id da sessão)
  4. Query 1: SUM(orders) WHERE tenant_id=X AND status=approved AND data >= -30d
  5. Query 2: COUNT(users) WHERE tenant_id=X AND status=active
  6. Query 3: COUNT(orders) WHERE tenant_id=X AND status=approved
  7. Retornar { revenue, totalStudents, totalOrders, conversion: 0 }
  8. Try/catch com logging

Estrutura de Dados:
  type DashboardKPIs = {
    revenue: number;        // em centavos (compatível com BD)
    totalStudents: number;  // count
    totalOrders: number;    // count
    conversion: number;     // percentual (0-100)
    period: "30d";          // para UI saber o contexto
  }

Edge Cases:
  - Tenant sem orders (retorna 0, não erro)
  - User sem permissão (authenticado?)
  - Database error (catch e logar)
```

### Resultado do PLAN

Antes de executar, ter clareza:

- [x] Entendi o que preciso fazer?
- [x] Meu design segue architecture.md?
- [x] Meu código vai seguir naming conventions?
- [x] Qual é meu primeiro commit?
- [x] Qual é o segundo commit?
- [x] Testei responsivo? (se UI)
- [x] Testei error states? (se relevante)

---

## Fase 4: EXECUTE (Codificação)

**Responsabilidade:** Escrever o código, testar, commitar.

### Workflow de EXECUTE

```
1. Criar arquivo(s) conforme plano
2. Escrever código (ler references, seguir padrões)
3. Validar inputs com Zod (se API input)
4. Filtrar por tenant_id (se context de tenant)
5. Handle errors (try/catch, logging)
6. Testar (responsivo, error states, edge cases)
7. Commitar (uma task = um commit)
8. Marcar issue como done (rename or ✅ in title)
```

### Padrão de Commit

```bash
# Uma task = um commit
git add src/app/painel/dashboard/load-kpis.ts
git commit -m "feat(dashboard): add loadDashboardKPIs server action"

# Se múltiplos arquivos na mesma task:
git commit -m "feat(dashboard): implement KPI loading and display"

# Se bugfix durante execute:
git commit -m "fix(dashboard): handle zero orders edge case"
```

### Testing na EXECUTE

Antes de marcar como done:

- **Funcional**: Acceptance criteria passam?
- **Responsivo**: Testado em 3+ tamanhos (mobile, tablet, desktop)?
- **Erros**: Testar edge cases (zero data, network error, etc)?
- **Segurança**: Validação Zod? tenant_id filtrado?
- **Performance**: Query < 1s? N+1 avoidado?
- **Accessibility**: Labels? Contrast? Keyboard nav?

---

## Fases 3+ 5: Proto → Functional Progression

Quando uma feature tem muita UI + lógica, usar progressão:

### Fase 1: Proto (UI apenas)

```
Goal: Fazer toda a UI com dados hardcoded.
Focus: Design system compliance, responsive layout, component structure.
Não: API calls, DB queries, integrações.

Exemplo: "Criar layout do dashboard com cards hardcoded"
  ✅ Cards com KPIs hardcoded (revenue: 5000, students: 23, etc)
  ✅ Gráfico com dados fake (Recharts)
  ✅ Responsivo testado
  ✅ Sem API calls
```

### Fase 2: Foundation (Setup)

```
Goal: Preparar infraestrutura (BD, Auth, API clients).
Focus: Schema, middleware, auth, criptografia.
Não: Conectar protó com real data ainda.

Exemplo: "Setup banco para orders e tenants"
  ✅ Schema Prisma com Order model
  ✅ Migration criada e testada
  ✅ Seed data
  ✅ Sem UI
```

### Fase 3: Behavior (Lógica)

```
Goal: Conectar proto com real data.
Focus: Server actions, API routes, DB queries.
Não: Webhooks ou fluxos cross-sistema.

Exemplo: "Conectar dashboard com real data de orders"
  ✅ Server action loadDashboardKPIs()
  ✅ Replace hardcoded data com real queries
  ✅ Handle loading/error states
```

### Fase 4: Integration (Fluxos)

```
Goal: Webhooks, cron jobs, cross-system flows.
Focus: Sincronização, eventos, automação.

Exemplo: "Webhook MP atualiza status de order"
  ✅ Endpoint de webhook em /api/webhooks/mp
  ✅ Valida assinatura
  ✅ Atualiza order no BD
  ✅ Chama plataforma parceira para matricular aluno
```

### Exemplo Real: Feature Checkout

```
Sprint 1: Proto Checkout
  Issue 001: Create checkout form UI (hardcoded)
  Issue 002: Create order summary UI (hardcoded)
  Result: Cliquável mas não funciona

Sprint 2: Foundation
  Issue 003: Setup Order model no Prisma
  Issue 004: Setup Mercado Pago client + auth
  Result: Infra pronta, sem UI conectada

Sprint 3: Behavior
  Issue 005: Load cart data in checkout
  Issue 006: Submit order e criar no BD
  Issue 007: Update form com validação
  Result: Checkout funciona, não trata pagamento ainda

Sprint 4: Integration
  Issue 008: Mercado Pago webhook
  Issue 009: Auto-matricula na plataforma parceira
  Issue 010: Email de confirmação
  Result: Full funnel: checkout → pagamento → matrícula → email
```

---

## Quality Rules (SEMPRE)

Indepentemente da fase, SEMPRE:

1. **Zod Validation**: Toda API input validada
   ```typescript
   const Input = z.object({
     courseId: z.string().uuid(),
     quantity: z.number().positive(),
   });
   const input = Input.parse(body);
   ```

2. **Tenant Security**: Filtrar por tenant_id em contextos tenant-scoped
   ```typescript
   const tenant = await getCurrentTenant();
   const orders = await prisma.order.findMany({
     where: { tenant_id: tenant.id }, // OBRIGATÓRIO
   });
   ```

3. **Responsive First**: Testar mobile antes de desktop
   ```
   Mobile: 375px
   Tablet: 768px
   Desktop: 1024px
   ```

4. **Error Handling**: Nunca swallow errors
   ```typescript
   try {
     // lógica
   } catch (error) {
     console.error("Context:", error);
     return { error: "User-friendly message", code: "ERROR_CODE" };
   }
   ```

5. **Naming**: Seguir conventions
   - Components: PascalCase
   - Actions: camelCase verbs (loadDashboard, submitCheckout)
   - Files: kebab-case
   - Types: PascalCase com sufixo (CreateCourseInput)

---

## Exemplo Passo-a-Passo Completo

### Scenario: Implementar "Delete Course"

#### SPEC (já pronto)
```
## SPEC: Course Management

User Story: Como revendedor, eu quero deletar um curso para removê-lo da vitrine.
```

#### BREAK
```markdown
# Issue: 005 — Delete Course Behavior

## Task
Implementar server action para deletar um curso (soft delete).

## Aceitação
- [ ] revendedor pode deletar seu próprio curso
- [ ] curso deletado não aparece mais na lista
- [ ] não pode deletar curso de outro revendedor
- [ ] alunos já matriculados não são afetados
```

#### PLAN (Dev faz isto)
```
1. Ler issue — confirma: soft delete, tenant-scoped
2. Ler architecture.md — confirma: Server Action, getCurrentTenant(), sempre filtrar tenant_id
3. Ler design-system.md — confirma: botão destructive (red) em modais
4. Pesquisar código:
   - Grep por "prisma.course.update" — vejo update patterns
   - Grep por "deleted_at" — vejo soft delete pattern
5. Planejar:
   - Arquivo: src/app/painel/cursos/delete-course.ts
   - Função: async deleteCourse(courseId: string)
   - Validar: courseId, getCurrentTenant(), findUnique
   - Update: set deleted_at = now() (soft delete)
   - Retornar: { success: true } ou { error: string }
6. Edge cases:
   - Course não existe
   - Course de outro tenant
   - User sem permissão
```

#### EXECUTE (Dev faz código)

Arquivo 1: `src/app/painel/cursos/delete-course.ts`

```typescript
"use server";
import { getCurrentTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";

export async function deleteCourse(courseId: string) {
  try {
    const tenant = await getCurrentTenant();
    if (!tenant) throw new Error("Tenant required");

    // Validar que course pertence ao tenant
    const course = await prisma.course.findUnique({
      where: {
        id: courseId,
        tenant_id: tenant.id, // Security!
      },
    });

    if (!course) {
      return { error: "Course not found", code: "NOT_FOUND" };
    }

    // Soft delete
    await prisma.course.update({
      where: { id: courseId },
      data: { deleted_at: new Date() },
    });

    return { success: true };
  } catch (error) {
    console.error("[deleteCourse] error:", error);
    return { error: "Failed to delete course", code: "DB_ERROR" };
  }
}
```

Arquivo 2: `src/app/painel/cursos/course-actions.tsx` (client component)

```typescript
"use client";
import { deleteCourse } from "./delete-course";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useState } from "react";

export function DeleteCourseButton({ courseId }: { courseId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    setLoading(true);
    const result = await deleteCourse(courseId);
    setLoading(false);

    if (result.error) {
      alert(`Erro: ${result.error}`);
      return;
    }

    setOpen(false);
    // Refresh page or list
    window.location.reload();
  }

  return (
    <>
      <Button
        variant="destructive"
        size="sm"
        onClick={() => setOpen(true)}
      >
        Deletar
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <h2 className="text-lg font-semibold">Confirmar exclusão?</h2>
          <p className="text-gray-600">
            Esta ação não pode ser desfeita. O curso será removido da vitrine.
          </p>
          <div className="flex gap-4 justify-end">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={loading}
            >
              {loading ? "Deletando..." : "Deletar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

#### Testing
- [x] Deletei curso, saiu da lista?
- [x] Tentei deletar de outro tenant, foi bloqueado?
- [x] Modal mostra?
- [x] Responsivo em mobile/tablet/desktop?
- [x] Alunos já matriculados continuam ativos?

#### Commit
```bash
git add src/app/painel/cursos/delete-course.ts src/app/painel/cursos/course-actions.tsx
git commit -m "feat(cursos): implement soft delete course"
```

#### Mark as Done
Renomear arquivo de issue:
```
issues/005-delete-course.md → issues/005-delete-course-✅.md
```

---

## Resumo: Quando Pegar um Issue

1. **Antes de tudo:**
   - Ler arquivo de issue até final
   - Ler `docs/references/architecture.md` e `design-system.md`
   - Pesquisar código existente com Grep

2. **Planejamento:**
   - Quais arquivos vou criar/editar?
   - Qual é a estrutura?
   - Quais são os edge cases?

3. **Execução:**
   - Seguir padrões (Zod validation, tenant_id, naming)
   - Testar responsivo e edge cases
   - Um issue = um commit

4. **Qualidade:**
   - Zod validation: SEMPRE
   - Tenant filtering: SEMPRE em vitrine/painel
   - Error handling: SEMPRE
   - Testing: SEMPRE responsivo + edge cases

---

## Arquivo de Referência

Antes de executar qualquer issue, ler em sequência:

1. `docs/references/workflow.md` (ESTE ARQUIVO) — entender fases
2. `docs/references/architecture.md` — padrões técnicos
3. `docs/references/design-system.md` — padrões de UI
4. Arquivo de issue específico — detalhe da task
5. Código existente — ver patterns no projeto

Se tiver dúvida sobre algo, sempre preferir ler a docs do que adivinhar.

---

## Conclusão

O workflow SPEC→BREAK→PLAN→EXECUTE garante:

- ✅ Features bem entendidas antes de codificar
- ✅ Tasks pequenas e focar
- ✅ Padrões consistentes
- ✅ Código de qualidade (seguro, testado)
- ✅ Onboarding fácil para novos devs

Siga este workflow em TODA task do PMB.
