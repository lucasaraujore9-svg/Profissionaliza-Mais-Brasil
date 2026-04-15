# Issue 059 — Redesign Painel Admin Master (Fase 3B)

**Tipo:** design
**Escopo:** `src/app/admin/*` + `src/components/admin/*`
**Depende de:** 055 (tokens globais)
**Prioridade:** P3

## Objetivo

Alinhar o painel do Admin Master (quem opera o PMB) com a identidade PMB. Aqui e **cockpit interno** — tom sobrio profissional, alta densidade de informacao, foco em acoes rapidas e deteccao de anomalias. Sem calorosidade do lado publico.

## Paginas e Ajustes

### `admin/page.tsx` — Dashboard central
- AdminMetricCards: 6 kpis (revendedores ativos, MRR, inadimplencia, churn, alunos, cursos)
- AdminQuickStatsBar: barra densa de numeros
- AdminDualRevenueChart: 2 linhas (MRR nosso vs faturamento revendedores) com cores PMB
- AdminTopResellersTable: top 10 revendedores com sparklines
- AdminOverdueSection: alerta de inadimplencia com acento terracotta
- AdminAlertsPanel: alerts de webhooks/integracoes

### `admin/revendedores/page.tsx`
- ResellerListToolbar: filtros + busca + export
- ResellerTable: tabela densa com status + mrr + mode billing + ultima atividade
- ResellerStatsBar

### `admin/revendedores/[id]/page.tsx`
- ResellerProfile: header com dados + status + acoes rapidas
- ResellerStatsBar: stats do revendedor
- ResellerStudentCount + ResellerPaymentHistory
- ResellerPolicyConfig: config de billing/comissao
- ResellerActionButtons: ativar/suspender/contactar

### `admin/financeiro/page.tsx`
- AdminFinanceSummary: numeros grandes MRR/ARR/churn
- AdminOverdueSection
- AdminPaymentList: tabela de pagamentos

### `admin/analytics/page.tsx`
- AnalyticsKpiCards + AnalyticsCharts + AnalyticsRankingTable + AnalyticsFilters

### `admin/catalogo/page.tsx`
- CatalogHeader + CatalogSyncButton + CatalogSyncLog + CatalogCourseGrid

### `admin/configuracoes/page.tsx`
- AdminConfigTabs: tabs com paleta PMB
- SystemInfo + WebhookConfig + IntegrationTestCards

## Criterios de Aceite

- [ ] Dashboard admin com paleta PMB e alta densidade de informacao
- [ ] Cores semanticas em alerts/status (lime=ok, gold=atencao, terracotta=critico)
- [ ] Charts com paleta PMB (verde + gold + cyan + lime + terracotta como chart-1..5)
- [ ] Tabelas densas mas legiveis (zebra sutil, headers destacados)
- [ ] Tipografia DM Sans + Geist Mono em numeros
- [ ] `npm run build` verde
