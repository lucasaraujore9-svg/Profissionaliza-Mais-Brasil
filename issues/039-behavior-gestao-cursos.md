# Issue 039 — Gestão de Cursos: CRUD Revendedor

**Tipo:** behavior
**Página:** /painel/cursos
**Depende de:** 009, 020, 023
**Prioridade:** P1

## O Que Fazer

Implementar gestão de cursos revendedor: carregar cursos, editar detalhes, toggle visibility, toggle tipo pagamento, deletar. Todas queries filtradas por tenant_id.

## Componentes Envolvidos
- GET /api/painel/cursos — listar cursos do tenant
- PUT /api/painel/cursos/[id] — atualizar curso
- PATCH /api/painel/cursos/[id]/visibility — toggle visibility
- DELETE /api/painel/cursos/[id] — deletar curso
- CourseListTable, CourseEditDrawer com dados reais

## Comportamentos
- `load-courses` — GET /api/painel/cursos WHERE tenant_id
- `edit-course` — PUT /api/painel/cursos/[id] com Zod validation
- `toggle-visibility` — PATCH /api/painel/cursos/[id]/visibility
- `toggle-payment-type` — atualizar payment_type (UNICO vs RECORRENTE)
- `delete-course` — DELETE /api/painel/cursos/[id] com confirmação

## Critério de Aceite
- [ ] GET /api/painel/cursos implementado
- [ ] Query Prisma WHERE tenant_id, ORDER BY createdAt DESC
- [ ] Retorna { id, title, price, students_count, payment_type, visibility }
- [ ] CourseListTable renderiza com 10+ cursos
- [ ] Clicar "Editar" abre CourseEditDrawer
- [ ] PUT /api/painel/cursos/[id] implementado
- [ ] Zod schema validar título, preço, descrição
- [ ] Atualiza Prisma Course { title, price, description, ... }
- [ ] PATCH /api/painel/cursos/[id]/visibility toggle
- [ ] Visibilidade atualiza em tempo real na tabela
- [ ] DELETE /api/painel/cursos/[id] com modal confirmação
- [ ] Curso removido da tabela após delete
