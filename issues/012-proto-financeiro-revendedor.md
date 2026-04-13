# Issue 012 — Financeiro Revendedor Prototype

**Tipo:** proto
**Página:** /painel/financeiro
**Depende de:** nenhuma
**Prioridade:** P0

## O Que Fazer

Criar página financeira do revendedor. Componentes: header com filtros período, cards resumo, gráfico receita, tabela pagamentos. Dados hardcoded.

## Componentes Envolvidos
- FinanceHeader — titulo "Financeiro", date range picker, filtros (status pagamento)
- SummaryCards — 4 cards: Receita MÊS, Recebido, Pendente, A Receber
- RevenueBarChart — gráfico barras receita por semana/mês
- PaymentTable — tabela: Data, Descrição, Valor, Status (Pago, Pendente, Cancelado)
- FilterBar — filtros: período, status, tipo transação
- ExportButton — botão "Exportar CSV"

## Comportamentos
- `render-financeiro` — exibir página completa
- `change-date-range` — atualizar filtro período
- `filter-by-status` — filtrar status pagamento (visual)
- `export-csv-mock` — botão clicável mas sem download real
- `change-chart-view` — mudar entre semana/mês

## Critério de Aceite
- [ ] FinanceHeader com titulo e date range picker
- [ ] SummaryCards exibe 4 números hardcoded
- [ ] RevenueBarChart renderiza com dados
- [ ] PaymentTable com 15+ transações exemplo
- [ ] Colunas corretas: Data, Descrição, Valor, Status
- [ ] FilterBar com filtros funcionais visualmente
- [ ] ExportButton presente e clicável
- [ ] Layout responsivo
- [ ] Tipografia clara (valores em R$ correto)
