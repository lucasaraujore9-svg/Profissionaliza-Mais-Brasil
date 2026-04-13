# Issue 010 — Gestão de Alunos Prototype

**Tipo:** proto
**Página:** /painel/alunos
**Depende de:** nenhuma
**Prioridade:** P0

## O Que Fazer

Criar página de gestão de alunos do revendedor. Componentes: header com filtros, bar de estatísticas, tabela 15 alunos, drawer detalhes aluno. Dados hardcoded.

## Componentes Envolvidos
- StudentListHeader — titulo "Alunos", busca por nome/email, filtros status (Ativo, Bloqueado, Inativo)
- StudentStatsBar — 4 stats inline: Total, Ativos, Bloqueados, Inativos
- StudentTable — colunas: Nome, Email, Cursos, Data Matricula, Status, Ações
- StudentDetailDrawer — detalhes completos aluno, list de cursos, botões: Bloquear, Desbloquear, Enviar Mensagem
- ActionButtons — botões em linha: Ver Detalhes, Bloquear/Desbloquear

## Comportamentos
- `render-student-list` — exibir tabela com 15 alunos
- `click-ver-detalhes` — abrir drawer detalhes
- `filter-by-status` — filtrar status aluno (visual)
- `search-students` — buscar por nome/email (visual)
- `toggle-block-unblock` — mudar status na tabela

## Critério de Aceite
- [ ] StudentListHeader com titulo, busca, filtros
- [ ] StudentStatsBar exibe 4 números (hardcoded)
- [ ] StudentTable com 15 alunos, colunas corretas
- [ ] Clicar "Ver Detalhes" abre StudentDetailDrawer
- [ ] Drawer exibe informações aluno completas
- [ ] Lista de cursos do aluno visível no drawer
- [ ] Botões Bloquear/Desbloquear visíveis
- [ ] Botão "Enviar Mensagem" presente
- [ ] Search e filters funcionam visualmente
- [ ] Layout responsivo
