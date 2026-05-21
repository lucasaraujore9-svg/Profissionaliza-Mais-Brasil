# Issue 019 — Analytics + Config Admin Prototype

**Tipo:** proto
**Página:** /admin/analytics, /admin/configuracoes
**Depende de:** nenhuma
**Prioridade:** P0

## O Que Fazer

Criar página analytics e configurações do Admin. Componentes: filtros analytics, KPI cards, 6 charts, ranking revendedores, tabs configuração, seções testes API. Dados hardcoded.

## Componentes Envolvidos
- AnalyticsFilters — date range, filtro revendedor, filtro status
- KPICards — 6 cards: Novos Revendedores, Novo Alunos, Conversão, MRR Média, Churn, LTV
- Charts — 6 gráficos: Receita Mensal, Alunos Crescimento, Conversão, Distribuição Revendedores, Origem Alunos, Satisfação
- RankingTable — top 10 revendedores por métrica selecionada
- ConfigTabs — 4 tabs: Geral, Integrações, Webhooks, Sobre
- IntegrationTestCards — cards testes: "Testar Conexão plataforma", "Testar Asaas", "Testar MP"
- WebhookConfig — input webhook secret, tabela histórico webhooks
- SystemInfo — card informações sistema: Versão, Ambiente, Últimas Sincronizações

## Comportamentos
- `render-analytics` — exibir todas charts
- `change-analytics-filter` — filtros atualizam visual
- `render-config-tabs` — exibir tabs
- `click-test-button` — testar conexões (visual)
- `view-webhook-log` — expandir histórico

## Critério de Aceite
- [ ] AnalyticsFilters com date range e filtros
- [ ] KPICards exibe 6 números
- [ ] 6 Charts renderizam com dados
- [ ] RankingTable com 10 revendedores
- [ ] ConfigTabs com 4 tabs visíveis
- [ ] Cards testes presentes e clicáveis
- [ ] WebhookConfig com inputs e tabela
- [ ] SystemInfo exibe informações
- [ ] Layout responsivo
- [ ] Tipografia e cores corretas
