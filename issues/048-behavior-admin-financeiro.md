# Issue 048 — Admin Financeiro + Catálogo: Pagamentos + Sync

**Tipo:** behavior
**Página:** /admin/financeiro, /admin/catalogo
**Depende de:** 018, 024
**Prioridade:** P1

## O Que Fazer

Implementar financeiro admin: carregar resumo financeiro global, histórico pagamentos, seção inadimplência. E catálogo: sincronizar cursos EA, exibir grid, log sincronização.

## Componentes Envolvidos
- GET /api/admin/financeiro — métricas + payments Asaas
- GET /api/admin/financeiro/overdue — inadimplência
- GET /api/admin/catalogo — cursos agregados
- POST /api/admin/catalogo/sync — sincronizar EA cursos/listar
- GET /api/admin/catalogo/sync-log — histórico sincronizações

## Comportamentos
- `load-financeiro-admin` — GET /api/admin/financeiro
- `calculate-global-financials` — MRR, ARR, churn, LTV
- `load-payments-asaas` — GET Asaas /payments
- `load-overdue` — Tenant com status OVERDUE
- `load-catalogo` — GET /api/admin/catalogo (todos cursos)
- `sync-courses-ea` — POST /api/admin/catalogo/sync (EA API)
- `update-sync-log` — registrar resultado sync

## Critério de Aceite
- [ ] GET /api/admin/financeiro implementado
- [ ] Calcula MRR: SUM(Tenant.mrr) WHERE status=ACTIVE
- [ ] Calcula ARR: MRR * 12
- [ ] Calcula churn: (canceled tenants / total tenants) * 100
- [ ] AdminFinanceSummary com 4 cards
- [ ] PaymentList mostra payments Asaas
- [ ] OverdueSection mostra inadimplência
- [ ] GET /api/admin/catalogo retorna todos cursos (agregado)
- [ ] CourseGrid renderiza com 20+ cursos
- [ ] POST /api/admin/catalogo/sync chama EA cursos/listar
- [ ] Compara com DB, cria/atualiza courses
- [ ] GET /api/admin/catalogo/sync-log retorna histórico
- [ ] SyncLog tabela com data, status, contagem
