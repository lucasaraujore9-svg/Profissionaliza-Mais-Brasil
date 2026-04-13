# Issue 009 — Gestão de Cursos Prototype

**Tipo:** proto
**Página:** /painel/cursos
**Depende de:** nenhuma
**Prioridade:** P0

## O Que Fazer

Criar página de gestão de cursos do revendedor. Componentes: header com busca/filtros, tabela 10 cursos, drawer para edição. Dados hardcoded.

## Componentes Envolvidos
- CourseListHeader — titulo "Meus Cursos", botão "+ Novo Curso", search bar, filtros (ativo/inativo)
- CourseListTable — colunas: Título, Alunos, Preço, Tipo (Único/Recorrente), Status, Ações
- CourseEditDrawer — form para editar: título, descrição, preço, tipo pagamento, visibility toggle
- ActionButtons — botões em cada linha: Editar, Duplicar, Deletar (com modal confirmação visual)

## Comportamentos
- `render-course-list` — exibir tabela com 10 cursos
- `click-editar` — abrir drawer edição
- `toggle-visibility` — mudar status visível/oculto na tabela
- `search-courses` — filtrar cursos por título (visual)
- `filter-by-status` — filtrar ativo/inativo (visual)

## Critério de Aceite
- [ ] CourseListHeader com titulo, busca, filtros
- [ ] Botão "+ Novo Curso" visível
- [ ] CourseListTable renderiza com 10 cursos exemplo
- [ ] Colunas corretas: Título, Alunos, Preço, Tipo, Status, Ações
- [ ] Clicar "Editar" abre CourseEditDrawer
- [ ] CourseEditDrawer com inputs: título, preço, tipo, visibility
- [ ] Toggle visibility muda status na tabela
- [ ] Botões Duplicar e Deletar visíveis
- [ ] Search filtra visualmente
- [ ] Layout responsivo (drawer ajusta mobile)
