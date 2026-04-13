# Issue 008 — Dashboard Revendedor Prototype

**Tipo:** proto
**Página:** /painel
**Depende de:** nenhuma
**Prioridade:** P0

## O Que Fazer

Criar dashboard principal do revendedor. Componentes: sidebar navegação, header com greeting, metric cards, chart receita, tabela vendas recentes, quick actions. Dados hardcoded.

## Componentes Envolvidos
- SidebarPainel — menu: Dashboard, Cursos, Alunos, Cupons, Financeiro, Domínio, Vitrine, Config
- HeaderPainel — greeting "Bem-vindo, [Nome]", date picker período
- MetricCards — 4 cards: Receita MÊS, Alunos MÊS, Taxa Conversão, Ticket Médio
- RevenueChart — gráfico linha receita últimos 30 dias
- RecentSalesTable — tabela 5 vendas recentes (aluno, valor, data, status)
- QuickActions — botões: Novo Cupom, Ver Alunos, Relatório

## Comportamentos
- `render-dashboard` — exibir layout completo
- `change-date-range` — date picker muda período (visual)
- `click-quick-action` — botões ações rápidas clicáveis
- `hover-chart` — tooltip em pontos do gráfico

## Critério de Aceite
- [ ] SidebarPainel renderiza com menu items
- [ ] HeaderPainel exibe greeting e date picker
- [ ] MetricCards mostra 4 cards com números
- [ ] RevenueChart exibe gráfico linha com dados hardcoded
- [ ] RecentSalesTable com 5 vendas exemplo
- [ ] QuickActions buttons visíveis e clicáveis
- [ ] Layout sidebar + main responsivo
- [ ] Cores primárias/secundárias corretas
- [ ] Tipografia clara
