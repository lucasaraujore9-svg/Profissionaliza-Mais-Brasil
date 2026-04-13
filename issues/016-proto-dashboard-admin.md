# Issue 016 — Dashboard Admin Prototype

**Tipo:** proto
**Página:** /admin
**Depende de:** nenhuma
**Prioridade:** P0

## O Que Fazer

Criar dashboard do Admin Master. Componentes: sidebar navegação admin, header greeting, metric cards globais, gráfico receita dual, tabela top revendedores, painel alertas. Dados hardcoded.

## Componentes Envolvidos
- SidebarAdmin — menu: Dashboard, Revendedores, Financeiro, Catálogo, Analytics, Configurações
- AdminMetricCards — 4 cards: Receita Total, Revendedores Ativos, Alunos, Inadimplência %
- DualRevenueChart — gráfico dupla linha (Receita Bruta, Receita Líquida)
- TopResellersTable — tabela 10 top revendedores: Nome, MRR, Alunos, Status
- AlertsPanel — 3-5 alertas: Revendedor com pagamento vencido, etc
- QuickStatsBar — 4 números inline no top (dashboard)

## Comportamentos
- `render-admin-dashboard` — exibir página completa
- `click-alert` — clicar alerta abre detalhes
- `click-top-reseller` — clicar na tabela navega para detalhe revendedor
- `change-date-range` — chart e números mudam (visual)

## Critério de Aceite
- [ ] SidebarAdmin renderiza com menu items
- [ ] AdminMetricCards exibe 4 números
- [ ] DualRevenueChart com 2 linhas dados
- [ ] TopResellersTable com 10 revendedores
- [ ] AlertsPanel exibe 3-5 alertas
- [ ] Cores e tipografia corretas
- [ ] Layout sidebar + main responsivo
- [ ] Nenhum console error
