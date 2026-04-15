# CLAUDE.md — Profissionaliza Mais Brasil

> **Leia este arquivo INTEIRO antes de executar qualquer tarefa.**
> Documentacao detalhada esta em `/docs/`. Consulte antes de implementar.

## O Que E Este Projeto

Plataforma SaaS multi-tenant de revenda de cursos profissionalizantes online.

- **Admin Master** gerencia o ecossistema e cobra mensalidades dos revendedores via **Asaas**
- **Revendedores** tem vitrines proprias com dominio personalizado e vendem cursos via **Mercado Pago**
- **Alunos** compram cursos e sao auto-matriculados na **Escola Avancada** (plataforma white-label com API)

Nos NAO somos uma plataforma de cursos. Os alunos assistem aulas na Escola Avancada. Nos construimos a camada comercial, vitrine, gestao e cobranca.

## Progresso Atual (2026-04-15)

### O que ja esta implementado

**Fundacao (020-029):** Prisma migrado + seed · middleware multi-tenant · NextAuth v5 (credentials, roles SUPER_ADMIN/PMB_SALES/PMB_RESELLER_MGR/RESELLER) · layouts auth/main/admin/painel/loja · clients EA/Asaas/MP · crypto AES-256-GCM · Redis Upstash · Resend + React Email.

**Prototipos (001-019):** UIs hardcoded de todas as 19 paginas principais.

**Behaviors (030-049):** landing, auth, checkout revendedor, vitrine, curso, checkout aluno, confirmacao, dashboard/cursos/alunos/cupons/financeiro revendedor, dominio (Vercel API), vitrine config (Supabase Storage), configuracoes, onboarding, dashboards + financeiro + analytics + config do admin.

**Webhooks/Cron (050-053):** webhook Asaas (PAYMENT_RECEIVED/OVERDUE ativa/suspende tenant) · webhook MP (matricula automatica na EA) · cron diario 6h sync cursos (vercel.json) · auto-block/unblock de alunos via `src/lib/auto-block.ts`.

**Home vitrine (054):** home udemy-style com logo oficial + navbar/footer.

**Expansao de roles e vitrine PMB (061-067):**
- UserRole expandido para SUPER_ADMIN, PMB_SALES, PMB_RESELLER_MGR, RESELLER (+ consultor via TenantMember role="consultant" com `maxDiscount`)
- Guards em `src/lib/auth/guards.ts` no padrao `{ ok, session } | { ok, response }`
- /admin/equipe (SUPER_ADMIN) — CRUD de usuarios PMB + atribuicao de tenants a gerentes
- /admin/revendedores (+ PMB_RESELLER_MGR) — lista filtrada por `accountManagerId`, aba Asaas, notas de suporte
- /admin/vendas/* (SUPER_ADMIN, PMB_SALES) — dashboard + nova venda (form single-page) + cupons (cap 50% para PMB_SALES) + alunos PMB
- /painel/equipe (RESELLER owner) — convida consultores, define `maxDiscount`
- **Vitrine PMB**: `Enrollment/Payment/Coupon.tenantId = null`; `Student.tenantId` aponta para tenant placeholder slug `__pmb__` criado lazy por `src/lib/pmb-tenant.ts`
- Env PMB: `PMB_MP_ACCESS_TOKEN` (plain), `PMB_EA_VENDEDOR_ID`, `PMB_EA_POLO`. Helpers em `src/lib/pmb-config.ts`
- Webhook MP (`src/lib/mercadopago/process.ts`) com branch `isPmbVitrine` — usa pmbContext sintetico, token plain, nao atualiza WebhookLog.tenantId
- Seed reescrito (`prisma/seed.ts`): super@/admin@ legado/vendas@/gerente@/owner1/owner2/consultor1, tenants revenda1+revenda2, 5 cursos (2 destaqueHome), 3 cupons (SUPER50, VENDAS30, CONSULT10). Cupons via findFirst+create (nao upsert) porque `@@unique([tenantId,code])` nao dedupe com NULL
- QA manual documentado em `docs/qa/PERFIS.md`

### Validacao executada em 2026-04-15

`npm install`, `npx prisma generate`, `npx tsc --noEmit`, `npm run build` — **todos verdes**. Fixes aplicados:
- Button shadcn nao suporta `asChild` — trocado por `<Link className="inline-flex ...">` direto em `src/app/admin/vendas/page.tsx`
- `MPPreferencePayer.email` exige string nao-nula — `src/app/api/admin/vendas/route.ts` valida `student.email` antes (400 se ausente)
- Coupon seed usa `findFirst`+`create` em vez de `upsert` (NULL em composite unique)

### Credenciais pos-seed (2026-04-15)

SUPER_ADMIN primario agora e `super@pmb.com.br` / `super123`. Matriz completa em `docs/qa/PERFIS.md`.

### Bugs conhecidos (pendentes)

- **Middleware file convention deprecado** no Next 16 (usar `proxy` em vez de `middleware`).
- Consultor (TenantMember) nao popula `session.user.tenantId` no JWT — cap de desconto e validado server-side via lookup de TenantMember na API.

### Proximas etapas

1. **Rodar `npx prisma db seed`** contra o banco atual para criar as novas credenciais.
2. **Executar checklist `docs/qa/PERFIS.md`** — validar fronteiras end-to-end por papel.
3. **Rollout design system (055-060)** — aplicar estilo PMB em todo o app (issues ja abertas).

## Stack

- **Next.js 15+** (App Router) + **TypeScript**
- **Tailwind CSS 4+** + **shadcn/ui**
- **Prisma 6+** + **PostgreSQL** (Supabase)
- **NextAuth.js v5** (Auth.js)
- **Upstash Redis** (cache de tenant + rate limiting)
- **Vercel** (hospedagem + wildcard domains)
- **Zod** (validacao) + **Zustand** (state) + **React Email + Resend** (emails)

## Workflow: SPEC → BREAK → PLAN → EXECUTE

Este projeto segue um workflow estruturado. **NUNCA comece a codificar sem seguir estes passos.**

1. **SPEC** — Toda funcionalidade esta documentada em `docs/SPEC.md` (paginas, componentes, comportamentos)
2. **BREAK** — A SPEC foi quebrada em 54 issues individuais em `issues/` (proto → infra → behavior → integration → design)
3. **PLAN** — Antes de codificar, use `/plan NNN` para ler a issue, docs de referencia e planejar
4. **EXECUTE** — Use `/execute NNN` para implementar seguindo o plano

### Comandos Disponiveis

| Comando | O que faz |
|---------|-----------|
| `/setup` | Inicializar projeto (deps, prisma, seed) |
| `/plan` | Planejar uma issue (ler docs, checar deps, produzir plano) |
| `/execute` | Executar uma issue (implementar codigo seguindo padroes) |
| `/status` | Ver progresso do projeto (issues completadas/pendentes) |
| `/next` | Sugerir proxima issue para executar |
| `/review` | Revisar codigo de uma issue completada |

### Ordem de Execucao

1. **Fundacao (020-029)**: Prisma, middleware, auth, layouts, API clients, crypto, cache, email
2. **Prototipos (001-019)**: UI com dados hardcoded, foco em design system
3. **Comportamentos (030-049)**: Conectar UIs a dados reais
4. **Webhooks/Cron (050-053)**: Processamento async
5. **Design premium (054+)**: Redesign de paginas publicas via Google Stitch

## Documentacao Essencial (LEIA antes de codificar)

| Arquivo | O que contem |
|---------|-------------|
| `docs/SPEC.md` | **SPEC COMPLETA**: Todas as 20+ paginas com componentes e comportamentos |
| `docs/references/architecture.md` | Padroes: thin client/fat server, behavior isolation, multi-tenant security, naming |
| `docs/references/design-system.md` | Tipografia, cores, componentes shadcn/ui, layouts, responsive, spacing |
| `docs/references/workflow.md` | Workflow SPEC→BREAK→PLAN→EXECUTE detalhado |
| `docs/architecture/profissionaliza-mais-brasil-blueprint.md` | Blueprint completo: atores, fluxos, integracao das 3 APIs, modelo de dados |
| `docs/architecture/DOMINIOS-GUIDE.md` | **CRITICO**: Multi-tenant com middleware, wildcard DNS, dominios custom via Vercel API |
| `docs/api/escola-avancada-api-completa.md` | Todos os 21 endpoints da API EA com params, responses e cuidados |
| `docs/design/STITCH-DESIGN-PLAN.md` | Design system, paleta, tipografia e prompts para 19 telas |
| `prisma/schema.prisma` | Schema completo do banco (12 models, pronto para `prisma migrate dev`) |
| `issues/` | **53 issues** individuais com tipo, dependencias, componentes e criterios de aceite |

## Estrutura de Pastas

```
profissionaliza-mais-brasil/
├── CLAUDE.md                        # ESTE ARQUIVO
├── .claude/
│   ├── settings.json                # Config do Claude Code
│   └── commands/                    # Slash commands
│       ├── setup.md                 # /setup — inicializar projeto
│       ├── plan.md                  # /plan — planejar uma issue
│       ├── execute.md               # /execute — executar uma issue
│       ├── status.md                # /status — ver progresso
│       ├── next.md                  # /next — sugerir proxima issue
│       └── review.md               # /review — revisar codigo
├── docs/                            # Documentacao (NAO APAGAR)
│   ├── SPEC.md                      # Spec completa (paginas, componentes, behaviors)
│   └── references/                  # Docs de referencia para agentes
│       ├── architecture.md          # Padroes de arquitetura
│       ├── design-system.md         # Sistema de design
│       └── workflow.md              # Workflow de desenvolvimento
├── issues/                          # 53 issues individuais (NNN-nome.md)
├── prisma/
│   └── schema.prisma                # Schema do banco (JA PRONTO)
├── public/
│   └── images/
│       └── logo.png                 # Logo da marca
├── .stitch/                         # Designs gerados pelo Google Stitch
│   └── designs/                     # HTMLs e screenshots das telas
└── src/                             # Codigo fonte (a ser criado)
    ├── app/                         # App Router Next.js
    │   ├── (auth)/                  # Login, register, forgot-password
    │   ├── (main)/                  # Site principal PMB
    │   ├── admin/                   # Painel Admin Master
    │   ├── painel/                  # Painel Revendedor
    │   ├── loja/                    # Vitrine multi-tenant
    │   └── api/                     # API Routes + Webhooks
    ├── components/
    │   ├── ui/                      # shadcn/ui
    │   ├── admin/                   # Componentes admin
    │   ├── painel/                  # Componentes revendedor
    │   ├── loja/                    # Componentes vitrine
    │   └── shared/                  # Compartilhados
    ├── lib/
    │   ├── prisma.ts                # Prisma client singleton
    │   ├── redis.ts                 # Upstash client
    │   ├── auth.ts                  # NextAuth config
    │   ├── crypto.ts                # AES-256-GCM para tokens MP
    │   ├── utils.ts                 # Helpers gerais
    │   ├── escola-avancada/         # Client API EA (form-data!)
    │   ├── asaas/                   # Client API Asaas
    │   ├── mercadopago/             # Client API MP
    │   └── tenant/                  # Resolver multi-tenant
    ├── hooks/                       # React hooks
    ├── stores/                      # Zustand stores
    ├── types/                       # Tipos globais
    └── middleware.ts                # MIDDLEWARE MULTI-TENANT (CRITICO)
```

## Arquitetura Multi-Tenant (MAIS IMPORTANTE DO SISTEMA)

O middleware do Next.js resolve o tenant a partir do hostname:

1. `profissionalizamaisbrasil.com.br` → Site principal (rotas normais)
2. `*.profissionalizamaisbrasil.com.br` → Vitrine do revendedor (rewrite para /loja/*)
3. `dominio-custom.com.br` → Vitrine do revendedor (rewrite para /loja/*)

**Implementacao detalhada em:** `docs/architecture/DOMINIOS-GUIDE.md`

**Regras:**
- Middleware roda no Edge Runtime — NAO pode usar Prisma direto
- Usar Upstash Redis como cache (funciona no Edge) + Supabase client como fallback
- TTL do cache: 5 minutos
- Subdominios reservados: www, app, api, admin, painel, mail, smtp, ftp, cdn, assets, static, staging, dev, test
- TODA query no contexto da vitrine DEVE filtrar por tenant_id
- NUNCA permitir acesso cross-tenant

## Integracoes API — Resumo Rapido

### Escola Avancada (form-data, NAO JSON!)
- Base: `https://SUAESCOLA.com/api/v2/`
- Auth: Token via form-data
- **Doc completa:** `docs/api/escola-avancada-api-completa.md`
- CUIDADOS: `vinculocurso` sem idcurso = vincula TODOS. DELETE usa HEADERS. Precos em formato BR.

### Asaas (JSON, REST padrao)
- Base: `https://api.asaas.com/v3/`
- Auth: Header `access_token`
- Webhook: token no header `asaas-access-token`, responder 200 em <22s

### Mercado Pago (JSON, REST)
- Base: `https://api.mercadopago.com/`
- Auth: Bearer Token (do REVENDEDOR, nao nosso!)
- Webhook: HMAC SHA256, envia so ID — precisa GET para detalhes
- `mp_access_token` DEVE ser criptografado com AES-256-GCM no banco

## Fluxos Criticos (decorar)

### Matricula Automatica
```
MP webhook → GET /v1/payments/{id} → status=approved
→ POST EA usuarios/novo {polo, vendedor, status:"ativo", apostila:"liberar"}
→ POST EA usuarios/vinculocurso {aluno, idcurso}
→ POST EA usuarios/envioemail {aluno}
→ Salvar enrollment no banco
```

### Bloqueio por Inadimplencia
```
MP webhook falhou → checar tenant.billing_mode
→ AUTO: POST EA usuarios/editar {status:"bloqueado", apostila:"bloquear"}
→ MANUAL: notificar revendedor
```

### Onboarding Revendedor
```
POST Asaas customers → POST Asaas subscriptions
→ Webhook PAYMENT_RECEIVED
→ POST EA funcionarios/novo → vendedor_id
→ Criar tenant no banco → Revendedor configura vitrine + conecta MP
```

## Padroes de Codigo

- TypeScript strict
- Componentes: PascalCase, um por arquivo
- API Routes: validar TODOS inputs com Zod
- Prisma: SEMPRE filtrar por tenant_id no contexto de vitrine
- Erros: try/catch com tipos customizados, nunca swallow errors
- Tokens: NUNCA expor no client. MP access_token criptografado.
- Webhooks: logar TUDO em webhook_logs, processar async, retornar 200 imediato

## MCP — Supabase (Project-Scoped)

Este projeto usa o Supabase MCP configurado em `.mcp.json` (project-local, nao commitado por seguranca).

- **Project Ref:** jpwskehhnplmmtgyyxmf
- **URL do projeto:** https://jpwskehhnplmmtgyyxmf.supabase.co
- **Access Token:** salvo em `SUPABASE_ACCESS_TOKEN` (.env.local)

### Como usar
Apos configurar o `.mcp.json` na raiz, reinicie o Claude Code. As ferramentas do Supabase ficarao disponiveis automaticamente para queries diretas no banco, gerenciamento de tabelas, RLS policies, etc.

### Onboarding em outra maquina
1. Copiar `.mcp.json.example` para `.mcp.json`
2. Substituir `${SUPABASE_ACCESS_TOKEN}` pelo token real (do .env.local)
3. Reiniciar Claude Code

### Importante
- Nunca commitar `.mcp.json` (contem token de admin do Supabase com poder total no projeto)
- O token expira? Nao — e um Personal Access Token, valido ate revogacao manual em supabase.com/dashboard/account/tokens
- Se vazar: revogar imediatamente em supabase.com/dashboard/account/tokens e gerar novo

## Variaveis de Ambiente

```env
# App
NEXT_PUBLIC_APP_URL=https://profissionalizamaisbrasil.com.br
NEXT_PUBLIC_APP_DOMAIN=profissionalizamaisbrasil.com.br

# Database (Supabase)
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...

# Supabase
SUPABASE_PROJECT_REF=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_ACCESS_TOKEN=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Redis (Upstash)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Auth
NEXTAUTH_SECRET=
NEXTAUTH_URL=https://profissionalizamaisbrasil.com.br

# Escola Avancada
EA_API_URL=https://SUAESCOLA.com/api/v2
EA_API_TOKEN=

# Asaas
ASAAS_API_URL=https://api.asaas.com/v3
ASAAS_API_KEY=
ASAAS_WEBHOOK_TOKEN=

# Mercado Pago (tokens dos revendedores sao por tenant, no banco)
# Nao tem token global aqui

# Vercel (dominios custom)
VERCEL_TOKEN=
VERCEL_PROJECT_ID=
VERCEL_TEAM_ID=

# Criptografia
ENCRYPTION_KEY=

# Email
RESEND_API_KEY=

# Cron
CRON_SECRET=
```

## Comandos Uteis

```bash
npm run dev                     # Dev server
npx prisma migrate dev          # Criar migration
npx prisma generate             # Gerar client
npx prisma studio               # UI do banco
npx prisma db seed              # Seed dados
```
