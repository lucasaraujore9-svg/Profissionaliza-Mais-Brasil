# Issue 049 — Admin Analytics + Config: Dashboards + Testes API

**Tipo:** behavior
**Página:** /admin/analytics, /admin/configuracoes
**Depende de:** 019, 024, 025
**Prioridade:** P1

## O Que Fazer

Implementar analytics admin com 6 charts e filtering, e configurações com testes API integração. Queries agregadas (sem tenant filter).

## Componentes Envolvidos
- GET /api/admin/analytics — KPIs + chart data
- GET /api/admin/config — configurações admin
- POST /api/admin/config/test-ea — testar conexão EA
- POST /api/admin/config/test-asaas — testar conexão Asaas
- POST /api/admin/config/test-mp — testar conexão MP

## Comportamentos
- `load-analytics` — GET /api/admin/analytics
- `filter-analytics` — período, revendedor
- `calculate-kpis` — 6 KPIs globais
- `load-6-charts` — receita, alunos, conversão, distribuição, origem, satisfação
- `load-top-resellers-ranking` — top 10 por métrica
- `load-config-tabs` — GET /api/admin/config
- `test-ea-connection` — POST /api/admin/config/test-ea
- `test-asaas-connection` — POST /api/admin/config/test-asaas
- `test-mp-connection` — POST /api/admin/config/test-mp

## Critério de Aceite
- [ ] GET /api/admin/analytics implementado
- [ ] KPICards com 6 números reais
- [ ] 6 Charts: Receita Mensal, Alunos, Conversão, Distribuição, Origem, Satisfação
- [ ] Filter período/revendedor funciona
- [ ] RankingTable top 10 revendedores
- [ ] ConfigTabs com 4 abas renderiza
- [ ] POST /api/admin/config/test-ea testa GET EA funcionarios/listar
- [ ] Retorna { status: success/error, message }
- [ ] POST /api/admin/config/test-asaas testa GET Asaas /customers
- [ ] POST /api/admin/config/test-mp retorna status token
- [ ] WebhookConfig com inputs webhook secret
- [ ] SystemInfo renderiza versão, ambiente, últimas syncs
