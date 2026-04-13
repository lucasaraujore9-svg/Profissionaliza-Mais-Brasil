# Issue 038 — Dashboard Revendedor: Métricas + Charts

**Tipo:** behavior
**Página:** /painel
**Depende de:** 008, 020, 023
**Prioridade:** P1

## O Que Fazer

Implementar dashboard revendedor com métricas reais: calcular receita mês, alunos novos, taxa conversão, exibir gráfico receita últimos 30 dias, tabela vendas recentes. Autenticado RESELLER.

## Componentes Envolvidos
- GET /api/painel/dashboard — métricas + histórico receita
- MetricCards, RevenueChart, RecentSalesTable com dados reais

## Comportamentos
- `load-dashboard` — GET /api/painel/dashboard filtrado por tenant_id
- `calculate-monthly-revenue` — soma enrollments aprovados mês atual
- `calculate-monthly-students` — conta students novos mês atual
- `calculate-conversion-rate` — (students / visits) * 100
- `load-revenue-chart-30days` — daily revenue últimos 30 dias
- `load-recent-sales` — últimas 10 enrollments aprovados

## Critério de Aceite
- [ ] GET /api/painel/dashboard implementado
- [ ] Middleware fornece tenant_id via session
- [ ] Calcula receita mês: SUM(Enrollment.price) WHERE createdAt >= start_month
- [ ] Calcula alunos: COUNT(Student) WHERE createdAt >= start_month
- [ ] Calcula conversão: COUNT(Enrollment) / COUNT(DISTINCT visitor) * 100 (mock se sem analytics)
- [ ] Query revenue por dia últimos 30 dias
- [ ] Retorna array [{ date, revenue }] para chart
- [ ] Query últimas 10 enrollments com student.name, price, createdAt, status
- [ ] MetricCards renderiza com números reais
- [ ] RevenueChart renderiza com dados corretos
- [ ] RecentSalesTable renderiza com vendas
- [ ] Sem console errors
