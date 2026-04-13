# Issue 042 — Financeiro Revendedor: Métricas + Histórico

**Tipo:** behavior
**Página:** /painel/financeiro
**Depende de:** 012, 020
**Prioridade:** P1

## O Que Fazer

Implementar financeiro revendedor: carregar resumo financeiro, histórico pagamentos, filtros período/status, exportar CSV.

## Componentes Envolvidos
- GET /api/painel/financeiro — métricas + transações
- GET /api/painel/financeiro/export-csv — exportar histórico
- FinanceHeader, SummaryCards, RevenueBarChart, PaymentTable com dados reais

## Comportamentos
- `load-financeiro` — GET /api/painel/financeiro filtrado por tenant_id
- `change-date-range` — filtrar período
- `filter-by-status` — filtrar status pagamento
- `export-csv` — GET /api/painel/financeiro/export-csv download arquivo
- `calculate-summaries` — receita mês, recebido, pendente, a receber

## Critério de Aceite
- [ ] GET /api/painel/financeiro implementado
- [ ] Query Enrollment WHERE tenant_id E status=APPROVED para receita
- [ ] Calcula: receita mês, recebido (Asaas), pendente (awaiting payment), a receber
- [ ] Query pagamentos Asaas via Asaas client
- [ ] Retorna { metrics, payments: [{ date, description, value, status }] }
- [ ] SummaryCards renderiza com 4 números
- [ ] RevenueBarChart com dados receita por semana/mês
- [ ] PaymentTable com 15+ transações
- [ ] Filtros período e status funcionam
- [ ] GET /api/painel/financeiro/export-csv retorna CSV
- [ ] Download funciona no navegador
