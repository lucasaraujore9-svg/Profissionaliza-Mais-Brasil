# Issue 040 — Gestão de Alunos: Listagem + Detalhe + Ações

**Tipo:** behavior
**Página:** /painel/alunos
**Depende de:** 010, 024
**Prioridade:** P1

## O Que Fazer

Implementar gestão alunos revendedor: carregar alunos, buscar/filtrar, ver detalhes, bloquear/desbloquear aluno na EA, enviar mensagem. Integração EA API.

## Componentes Envolvidos
- GET /api/painel/alunos — listar alunos do tenant
- GET /api/painel/alunos/[id] — detalhe aluno
- POST /api/painel/alunos/[id]/bloquear — chamar EA usuarios/editar
- POST /api/painel/alunos/[id]/desbloquear — chamar EA usuarios/editar
- POST /api/painel/alunos/[id]/mensagem — chamar EA usuarios/enviarmensagem
- StudentTable, StudentDetailDrawer com dados reais

## Comportamentos
- `load-students` — GET /api/painel/alunos WHERE tenant_id
- `search-students` — filtrar por nome/email
- `filter-by-status` — filtrar ATIVO/BLOQUEADO/INATIVO
- `view-student-detail` — GET /api/painel/alunos/[id]
- `block-student` — POST /api/painel/alunos/[id]/bloquear (EA editar status:bloqueado)
- `unblock-student` — POST /api/painel/alunos/[id]/desbloquear (EA editar status:ativo)
- `send-message` — POST /api/painel/alunos/[id]/mensagem (EA enviarmensagem)

## Critério de Aceite
- [ ] GET /api/painel/alunos implementado
- [ ] Query Prisma Student WHERE tenant_id, include courses
- [ ] Retorna { id, email, name, courses, createdAt, status }
- [ ] StudentTable renderiza com 15+ alunos
- [ ] Search filtra por nome/email real
- [ ] Filter status atualiza tabela
- [ ] Clicar "Ver Detalhes" abre drawer
- [ ] GET /api/painel/alunos/[id] com cursos do aluno
- [ ] POST /api/painel/alunos/[id]/bloquear chama EA usuarios/editar { status: bloqueado }
- [ ] Status atualiza em DB e tabela
- [ ] POST /api/painel/alunos/[id]/desbloquear chama EA usuarios/editar { status: ativo }
- [ ] POST /api/painel/alunos/[id]/mensagem chama EA usuarios/enviarmensagem
