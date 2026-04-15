# Issue 058 — Redesign Painel Revendedor (Fase 3A)

**Tipo:** design
**Escopo:** `src/app/painel/*` + `src/components/painel/*`
**Depende de:** 055 (tokens globais aplicados)
**Prioridade:** P2

## Objetivo

Alinhar o painel do revendedor (dashboard interno do cliente B2B) com a identidade PMB. Aqui o tom e **mais sobrio e produtivo** — o revendedor passa horas no painel, precisa de contraste bom, hierarquia clara, cards legiveis. Nao ser povao, mas manter paleta e tipografia.

## Paginas e Ajustes

### `painel/page.tsx` — Dashboard principal
- MetricCards: 4 cards com numero grande (DM Sans 700) + trend arrow colorido (lime verde / terracotta vermelho)
- RevenueChart: cores PMB (area fill gold + line verde-escuro)
- RecentSales: tabela clean com avatar + preco destacado
- QuickActions: botoes gold/cyan

### `painel/cursos/page.tsx`
- CourseListToolbar: filtros em pills PMB
- CourseListTable: linhas hoverable com selo ativo/inativo
- CourseEditDrawer: drawer lateral branco com CTAs PMB

### `painel/alunos/page.tsx`
- StudentStatsBar: stats rapidos com acentos PMB
- StudentTable: tabela com status badges (Ativo=lime, Inadimplente=terracotta)
- StudentDetailDrawer: perfil aluno com historico de compra

### `painel/cupons/page.tsx`
- CouponGrid: cards de cupom com codigo em Geist Mono + taxa de uso
- CreateCouponModal: modal com paleta PMB
- CouponUsageTable

### `painel/financeiro/page.tsx`
- FinanceSummaryCards: recebimentos, pendente, futuro com cores PMB
- FinanceBarChart: cores PMB
- FinancePaymentTable: status badges

### `painel/dominio/page.tsx`
- SubdomainDisplay: card destacado com copy-to-clipboard
- CustomDomainForm: input + botao verificar
- DnsInstructions: passos claros com icones

### `painel/vitrine/page.tsx`
- VitrineEditor: editor visual em 2 colunas (form + preview live)
- VitrinePreview: iframe/mockup com paleta aplicada
- VitrineConfigForm: inputs para cor, logo, banner

### `painel/configuracoes/page.tsx`
- ConfigTabs: abas em pills PMB
- AccountForm, SecurityForm, BillingSection

### `painel/onboarding/page.tsx`
- OnboardingWizard: wizard guiado com progress PMB
- Incluir copy acolhedora ("vamos configurar sua escola")

## Criterios de Aceite

- [ ] Todas as paginas do painel com paleta PMB consistente
- [ ] Charts com cores PMB (nao mais os cinzas shadcn default)
- [ ] Badges de status (Ativo/Pendente/Suspenso) em cores PMB semanticas
- [ ] Tipografia DM Sans em todos os headings + Geist Mono em numeros
- [ ] Sidebar + header + breadcrumbs consistentes (vem da Fase 1)
- [ ] Responsivo (tablets minimamente)
- [ ] `npm run build` verde
