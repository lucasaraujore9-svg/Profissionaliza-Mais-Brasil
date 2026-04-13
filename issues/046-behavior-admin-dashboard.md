# Issue 046 — Admin Dashboard: Métricas Globais

**Tipo:** behavior
**Página:** /admin
**Depende de:** 016, 020, 023
**Prioridade:** P1

## O Que Fazer

Implementar dashboard admin com métricas globais: receita total, revendedores ativos, alunos, inadimplência, gráfico receita dual, top revendedores, alertas. Sem filter tenant_id (global).

## Componentes Envolvidos
- GET /api/admin/dashboard — métricas globais
- AdminMetricCards, DualRevenueChart, TopResellersTable, AlertsPanel com dados reais

## Comportamentos
- `load-admin-dashboard` — GET /api/admin/dashboard (SEM tenant_id filter)
- `calculate-global-metrics` — receita total, revendedores, alunos, churn
- `load-dual-revenue-chart` — receita bruta vs líquida
- `load-top-resellers` — top 10 revendedores por MRR
- `load-alerts` — alertas inadimplência, etc
- `click-reseller` — navegar /admin/revendedores/[id]

## Critério de Aceite
- [ ] GET /api/admin/dashboard implementado
- [ ] Queries SUM/COUNT sem tenant_id (global)
- [ ] Calcula: receita total, revendedores ativos, alunos, churn %
- [ ] AdminMetricCards com 4 números
- [ ] DualRevenueChart com 2 linhas (Bruta, Líquida)
- [ ] TopResellersTable top 10 por MRR
- [ ] AlertsPanel com 3-5 alertas (inadimplência, etc)
- [ ] Clicar alerta mostra detalhes
- [ ] Clicar revendedor navega /admin/revendedores/[id]
- [ ] Sem console errors
