# Issue 072 — Caixa de atendimento nos paineis (admin + revenda)

**Tipo:** behavior (UI)
**Escopo:** `/admin/atendimento` + `/painel/atendimento` + API de listagem/resolucao
**Depende de:** 068, 070, 071
**Prioridade:** P2

## Contexto

`ContactMessage` (contato publico + suporte de aluno) precisa de uma caixa onde o dono ve e resolve as mensagens. PMB tem a sua (`/admin/atendimento`); cada unidade tem a sua (`/painel/atendimento`). Isolamento por tenant igual ao resto do sistema.

## O que fazer

### 1. `/admin/atendimento` (SUPER_ADMIN, PMB_SALES)

- Lista `ContactMessage` com `tenantId = null` (PMB), ordenada por `createdAt desc`, filtro por `status` (OPEN/RESOLVED) e por `kind` (CONTACT/STUDENT_SUPPORT).
- Cada item: nome, contato, assunto/trecho da mensagem, origem, data; link para `/admin/alunos/[id]` quando `studentId` presente.
- Acao "marcar como resolvido".

### 2. `/painel/atendimento` (membros do tenant)

- Igual, filtrado por `tenantId` do tenant da sessao (guard padrao `requireTenant`/equivalente). Nunca ver mensagens de outro tenant.
- Link para `/painel/alunos/[id]` quando `studentId` presente.

### 3. API de resolucao

- `PATCH /api/.../atendimento/[id]` (admin e painel) que seta `status=RESOLVED`, `resolvedAt`, `resolvedByUserId`. Validar escopo por tenant (admin so PMB+geral; painel so o proprio tenant).

### 4. Menu/sidebar

- Item "Atendimento" no sidebar do admin e do painel, com badge de contagem de `OPEN` (opcional).

## Criterios de Aceite

- [ ] `/admin/atendimento` lista mensagens PMB com filtros e marcar-resolvido
- [ ] `/painel/atendimento` lista mensagens do tenant, isolado (403/escopo em cross-tenant)
- [ ] Link para o perfil do aluno quando aplicavel
- [ ] Item de menu nos dois paineis
- [ ] `npx tsc --noEmit` + `npm run build` verdes
