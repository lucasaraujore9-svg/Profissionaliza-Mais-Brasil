# Profissionaliza Mais Brasil — Issues Breakdown

This folder contains 54 executable issues breaking down the complete project SPEC into focused, single-session tasks.

## Organization

### Prototypes (001-019) — UI Only
UI-only prototypes with hardcoded data. No API calls, no database queries. Focus: design system, responsividade, visual correctness.

- **001-019**: Landing, Seja Revendedor, Checkout Revendedor, Login, Vitrine, Curso, Checkout Aluno, Dashboard Revendedor, Gestão Cursos, Alunos, Cupons, Financeiro, Domínio, Vitrine Config, Configurações, Dashboard Admin, Gestão Revendedores, Financeiro Admin, Analytics

### Foundation/Infrastructure (020-029) — Core Systems
Infrastructure, database, auth, APIs, caching, email. These enable all other issues.

- **020**: Prisma migrate + seed
- **021**: Multi-tenant middleware (Edge Runtime, Upstash Redis)
- **022**: NextAuth.js v5 (credentials, role-based redirect)
- **023**: Layouts (auth, main, admin, painel, loja)
- **024**: Escola Avançada API client (21 endpoints, form-data)
- **025**: Asaas API client
- **026**: Mercado Pago API client
- **027**: AES-256-GCM crypto module
- **028**: Upstash Redis tenant cache
- **029**: Email templates + Resend

### Behavior (030-049) — Functional Features
Functional features with real database queries and API integrations. One behavior group per issue.

- **030-033**: Landing view, Interesse form, Revendedor checkout, Auth (login/forgot/reset)
- **034-037**: Vitrine catalog, Curso page, Aluno checkout, Confirmação
- **038-042**: Dashboard Revendedor, Gestão Cursos, Alunos, Cupons, Financeiro
- **043-045**: Domínio config, Vitrine config, Configurações + Onboarding
- **046-049**: Admin Dashboard, Gestão Revendedores, Financeiro + Catálogo, Analytics + Config

### Webhooks & Cron (050-053) — Background Processing
Webhook endpoints and cron jobs for async processing.

- **050**: Asaas webhook (PAYMENT_RECEIVED, PAYMENT_OVERDUE)
- **051**: Mercado Pago webhook (auto-enrollment, EA API calls)
- **052**: Cron sync (daily 6am, EA courses/listar)
- **053**: Auto block/unblock (inadimplência logic)

### Design Premium (054+) — Stitch-Driven Redesigns
Redesenhos premium via Google Stitch MCP, com direção editorial e palette BR.

- **054**: Home page premium (hero split, bento grid, zig-zag, FAQ editorial)

## Workflow

**Recommended execution order:**
1. **Foundations first** (020-029) — setup database, auth, APIs, caching
2. **Prototypes next** (001-019) — implement UI components with hardcoded data
3. **Behavior third** (030-049) — connect prototypes to real data/APIs
4. **Webhooks/Cron last** (050-053) — async processing

## File Format

Each issue follows this format:

```markdown
# Issue NNN — [Title]

**Tipo:** proto | infra | behavior | integration
**Página:** [page path or "global"]
**Depende de:** [issue numbers or "nenhuma"]
**Prioridade:** P0 | P1 | P2

## O Que Fazer
[Clear description of deliverable]

## Componentes Envolvidos
- ComponentName — brief description

## Comportamentos
- `behavior-name` — what it does

## Critério de Aceite
- [ ] checklist items
```

## Key Patterns

### Multi-Tenant Filtering
- **Always filter by `tenant_id` in vitrine routes** (`/loja/*`)
- Main domain queries are global (no tenant filter)
- Middleware provides `tenant_id` via request context

### API Client Design
- **Escola Avançada**: form-data (NOT JSON), token via field
- **Asaas**: JSON REST, token via header
- **Mercado Pago**: JSON REST, token per-tenant (encrypted in DB)

### Error Handling
- Wrap API calls in try/catch
- Log all errors with context (tenant_id, endpoint, input)
- Return meaningful error messages to client

### Caching
- Redis Upstash for tenant domain → ID mapping (TTL 5min)
- Invalidate cache on config updates
- Fallback to Supabase if Redis fails

## Stats

- **54 total issues**
- **19 prototypes** (UI)
- **10 infrastructure** (systems)
- **20 behavior** (features)
- **4 webhooks/cron** (async)
- **1 design redesign** (Stitch-driven)

All issues are independent or clearly ordered by dependencies. Ready to execute\!
