# Issue 018 — Financeiro Admin + Catálogo Prototype

**Tipo:** proto
**Página:** /admin/financeiro, /admin/catalogo
**Depende de:** nenhuma
**Prioridade:** P0

## O Que Fazer

Criar página financeira do Admin e catálogo sincronização. Componentes: resumo financeiro global, tabela pagamentos, seção inadimplência, catálogo cursos, botão sync, log sincronização. Dados hardcoded.

## Componentes Envolvidos
- AdminFinanceSummary — cards: MRR Total, ARR, Churn Rate, LTV Médio
- PaymentList — tabela pagamentos Asaas: Revendedor, Valor, Data, Status
- OverdueSection — tabela inadimplência: Revendedor, Dias Atraso, Valor
- CatalogHeader — titulo "Catálogo", botão "+ Sincronizar Cursos", last sync timestamp
- CourseGrid — grid 20 cursos agregados (todos os revendedores)
- SyncButton — botão "Sincronizar com plataforma parceira"
- SyncLog — tabela histórico sincronizações: data, status, cursos adicionados/atualizados

## Comportamentos
- `render-financeiro-admin` — exibir resumo financeiro
- `render-catalogo` — exibir grid cursos
- `click-sync` — botão sincronização clicável
- `view-sync-log` — expandir/colapsar log
- `filter-by-reseller` — filtrar cursos por revendedor

## Critério de Aceite
- [ ] AdminFinanceSummary com 4 cards números
- [ ] PaymentList tabela com 15+ pagamentos
- [ ] OverdueSection mostra inadimplência
- [ ] CatalogHeader com titulo e botão sync
- [ ] CourseGrid com 20 cursos
- [ ] SyncButton presente e clicável (visual)
- [ ] SyncLog tabela com histórico
- [ ] Layout responsivo
- [ ] Tipografia e cores corretas
