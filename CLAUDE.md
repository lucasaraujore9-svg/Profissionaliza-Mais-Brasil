# CLAUDE.md — Profissionaliza Mais Brasil

> **Leia este arquivo INTEIRO antes de executar qualquer tarefa.**
> Documentacao detalhada esta em `/docs/`. Consulte antes de implementar.

## O Que E Este Projeto

Plataforma SaaS multi-tenant de revenda de cursos profissionalizantes online.

- **Admin Master** gerencia o ecossistema e cobra mensalidades dos revendedores via **Asaas**
- **Revendedores** tem vitrines proprias com dominio personalizado e vendem cursos via **Mercado Pago**
- **Alunos** compram cursos e sao auto-matriculados na **plataforma parceira** (plataforma white-label com API)

Nos NAO somos uma plataforma de cursos. Os alunos assistem aulas na plataforma parceira. Nos construimos a camada comercial, vitrine, gestao e cobranca.

## Progresso Atual (2026-04-15)

### O que ja esta implementado

**Fundacao (020-029):** Prisma migrado + seed · middleware multi-tenant · NextAuth v5 (credentials, roles SUPER_ADMIN/PMB_SALES/PMB_RESELLER_MGR/RESELLER) · layouts auth/main/admin/painel/loja · clients plataforma/Asaas/MP · crypto AES-256-GCM · Redis Upstash · Resend + React Email.

**Prototipos (001-019):** UIs hardcoded de todas as 19 paginas principais.

**Behaviors (030-049):** landing, auth, checkout revendedor, vitrine, curso, checkout aluno, confirmacao, dashboard/cursos/alunos/cupons/financeiro revendedor, dominio (Vercel API), vitrine config (Supabase Storage), configuracoes, onboarding, dashboards + financeiro + analytics + config do admin.

**Webhooks/Cron (050-053):** webhook Asaas (PAYMENT_RECEIVED/OVERDUE ativa/suspende tenant) · webhook MP (matricula automatica na plataforma) · cron diario 6h sync cursos (vercel.json) · auto-block/unblock de alunos via `src/lib/auto-block.ts`.

**Home vitrine (054):** home udemy-style com logo oficial + navbar/footer.

**Expansao de roles e vitrine PMB (061-067):**
- UserRole expandido para SUPER_ADMIN, PMB_SALES, PMB_RESELLER_MGR, RESELLER (+ consultor via TenantMember role="consultant" com `maxDiscount`)
- Guards em `src/lib/auth/guards.ts` no padrao `{ ok, session } | { ok, response }`
- /admin/equipe (SUPER_ADMIN) — CRUD de usuarios PMB + atribuicao de tenants a gerentes
- /admin/revendedores (+ PMB_RESELLER_MGR) — lista filtrada por `accountManagerId`, aba Asaas, notas de suporte
- /admin/vendas/* (SUPER_ADMIN, PMB_SALES) — dashboard + nova venda (form single-page) + cupons (cap 50% para PMB_SALES) + alunos PMB
- /painel/equipe (RESELLER owner) — convida consultores, define `maxDiscount`
- **Vitrine PMB**: `Enrollment/Payment/Coupon.tenantId = null`; `Student.tenantId` aponta para tenant placeholder slug `__pmb__` criado lazy por `src/lib/pmb-tenant.ts`
- Env PMB: `PMB_MP_ACCESS_TOKEN` (plain), `PMB_PLATAFORMA_VENDEDOR_ID`, `PMB_PLATAFORMA_POLO`. Helpers em `src/lib/pmb-config.ts`
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

### Nova fornecedora LMS (2026-06-19, branch `feat/lms-provider`)

Segunda fornecedora de cursos: LMS proprio em `https://lms.bmbr.com.br` (API M2M REST JSON `/api/v1`, Bearer `LMS_API_KEY`). **Aditiva** — EA legada intacta. O LMS provisiona nos parceiros por baixo (PMB → LMS → EA); financeiro 100% no PMB.

- **Discriminador:** `Course.provider` (enum `EA`|`LMS`, default EA). `Course.lmsCourseId` (UUID/cuid, chave de match do sync) + `lmsSlug`. `nome` deixou de ser unique global → `@@unique([provider, nome])` (ripple corrigido em `sync.ts` + `seed.ts`). `Enrollment.lmsEnrollmentId`, `Student.lmsStudentId`, `SystemSettings.lmsDayUpdateCursor`. Migration idempotente `prisma/migrations/20260619_lms_provider`.
- **Client:** `src/lib/lms/` (config/errors/types/client) — wrappers tipados de todos os endpoints, retry/timeout no padrao EA.
- **Fluxo:** provisionamento ramifica em `fulfill.ts` (`provisionLmsAccess` via `POST /enrollments`, Idempotency-Key = id do pagamento; `provisionCourseForStudent` cobre pacotes mistos). `provisioning.ok=false` → alerta SUPER_ADMIN e segue. Catalogo: `sync-lms.ts` + cron `/api/cron/sync-cursos-lms`. Progresso/conclusao: `lms/day-update.ts` (delta, substitui webhook) + cron `/api/cron/sync-day-update-lms` → emite certificado existente. SSO: `/api/aluno/curso/[enrollmentId]/acessar` (botao no `/aluno` ramifica EA vs LMS). Bloqueio/revogacao: branch em `plataforma-actions.ts` (`setLmsStudentAccess`/`revokeLmsEnrollment`).
- **Pendente de deploy:** rodar os 2 novos jobs em `prisma/sql/pg_cron_jobs.sql` no Supabase (pg_cron manual); setar `LMS_API_URL`/`LMS_API_KEY` no Vercel. Validado: tsc + lint verdes, build compila, conexao live `GET /api/v1/courses` → 200.

### Papeis da equipe da unidade (2026-07-28, branch `feat/painel-roles`)

Antes: a unidade tinha so `owner` e `consultant`, e os dois viam o painel
completo do dono — o filtro `ownerOnly` do menu era codigo morto (`isOwner`
default `true`, nunca passado pela layout) e 85 das 93 rotas `/api/painel`
usavam `requireResellerSession`, que nao distingue dono de membro.

- **Fonte unica:** `src/lib/auth/painel-permissions.ts` — catalogo fechado de
  permissoes, 4 papeis atribuiveis (`manager`, `consultant`, `support`,
  `finance`) + `owner`, `resolvePermissions` (preset ∪ extra − revoked).
  `OWNER_EXCLUSIVE` (`equipe.manage`, `conta.delete`) nunca e concedida por
  override. Papel desconhecido — inclusive `"owner"` numa membership — cai no
  preset mais restrito (fail-closed).
- **Guard:** `src/lib/auth/painel-guard.ts` — `requirePainel` (403) para rotas,
  `requirePainelPage` (redirect) para paginas, `painelContext` para a layout.
  Permissoes NAO vao no JWT (ficariam obsoletas por ate 60s); sao resolvidas por
  request numa query indexada.
- **Escopo de dados:** `ctx.scope.{alunos,vendas,pagamentos,leads}` usa os campos
  de autoria ja existentes (`soldByUserId`, `ownerUserId`). Sem `*.viewAll`, a
  pessoa so ve a propria carteira — nas listagens **e** nos lookups por ID.
  Cuidado: em `where` que ja usa a chave `enrollments`, o escopo tem que ir em
  `AND`, senao o spread o sobrescreve (dois vazamentos assim ja foram corrigidos).
- **Overrides por pessoa:** `TenantMember.extraPermissions/revokedPermissions`
  (migration `20260728_tenant_member_roles`, idempotente, sem backfill).
- **Previa "ver como":** cookie assinado de 30 min, so para o dono, sempre
  reduzido a somente leitura por `toReadOnly`.
- **Quebra deliberada no deploy:** consultores existentes seguem com
  `role='consultant'` e caem no preset restrito de Vendedor. Quem atuava como
  gerente precisa ser repromovido pelo dono em `/painel/equipe`.

### Papeis e permissoes do sistema mae (2026-07-28)

Mesmo modelo da unidade, agora no /admin. Antes: sete valores de `UserRole` e a
matriz reimplementada a mao em cada rota (`requireAdminSession` + um
`if (role !== "SUPER_ADMIN")`), espalhada por 139 rotas e 47 paginas — foi assim
que /admin/financeiro passou a abrir para o vendedor de curso com a unica aba da
tela retornando 403.

- **Fonte unica:** `src/lib/auth/admin-permissions.ts` — catalogo fechado de
  permissoes + um preset por papel PMB. Os presets REPRODUZEM a matriz que os
  guards antigos aplicavam (ha teste de paridade), tirando os tightenings
  listados no fim desta secao. O que muda e que a matriz virou declarativa e
  ajustavel pessoa a pessoa.
- **A autorizacao virou permissao; as regras de negocio a jusante TAMBEM
  precisam.** Foi a causa raiz de cinco escaladas pegas na revisao: o guard
  passou a aceitar quem tem a permissao, mas o teto de desconto, o filtro de
  dono do cupom e o recorte de carteira continuavam perguntando "o papel e
  PMB_SALES?" e respondendo "nao e, entao libera". Ao mover um gate para
  permissao, procure toda trava interna que dependia daquele papel.
- **`unidades.viewAll` e SUPER_EXCLUSIVE.** Ela nao e so um filtro de listagem:
  e o substituto de todo bypass `role === "SUPER_ADMIN"` do codigo antigo, e
  quem a tem passa direto pelo recorte de carteira em senha do titular,
  impersonacao, gateway e export de comissoes.
- **Recorte de carteira sai do guard, nunca e re-derivado na rota.** Use
  `ctx.canAccessTenant(tenant)` (unidade ja carregada), `ctx.unidadesWhere()`
  (listagem) ou `ctx.comissoesScope()` (dinheiro de indicacao). A derivacao
  `can("unidades.view") && !can("unidades.viewAll")` que estava espalhada era
  errada nos dois sentidos: revogar `unidades.view` REMOVIA o filtro (ampliando
  o acesso) e ela assumia `accountManagerId` para papeis ligados por
  `salesUserId`.
- **Guard:** `src/lib/auth/admin-guard.ts` — `requireAdmin` (403) para rotas,
  `requireAdminPage` (redirect) para paginas, `adminContext` para a layout.
  Variantes `requireAdminAny` / `requireAdminPageAny` quando a rota tem dois
  publicos. Permissoes NAO vao no JWT (ficariam obsoletas por ate 60s pelo
  throttle do callback); sao resolvidas por request num `findUnique` na PK.
- **Escopo de dados:** continua ESTRUTURAL, vindo de `lib/auth/scope.ts` — no
  admin a unidade pertence a alguem por `accountManagerId`, `salesUserId` ou
  pelo time de vendas, conforme o papel. As permissoes `*.viewAll` funcionam
  como "ignore o recorte do papel": `ctx.unidadesWhere()` devolve `{}` para quem
  as tem, `null` para quem nao alcanca unidade nenhuma (a rota fecha).
- **Overrides por pessoa:** `User.extraPermissions/revokedPermissions`
  (migration `20260728_user_permissions`, idempotente, sem backfill). Editaveis
  em /admin/equipe (mesmo componente de "Permissoes avancadas" do painel).
  `equipe.manage` e SUPER_EXCLUSIVE — nunca concedida por override, porque e a
  permissao que deixaria alguem ampliar os proprios poderes.
- **Invariante testada:** `src/app/api/admin/guard-coverage.test.ts` quebra se
  uma rota nova nascer sem `requireAdmin`, se uma pagina nascer sem
  `requireAdminPage`, se alguem voltar a decidir autorizacao pelo papel do ator,
  ou se um guard por papel reaparecer.
- **Revisao multi-agente (xhigh) rodada antes do commit:** 15 defeitos
  confirmados, todos corrigidos. Cinco eram escalada de privilegio real
  (cancelar cobranca de qualquer unidade, desconto e cupom de 100% sem teto,
  clawback fora da carteira, saques da rede inteira ao REVOGAR uma permissao) e
  um era IDOR na pagina de comissoes da unidade. O teste de paridade chegou a
  ratificar um alargamento como se fosse a matriz antiga — trava de regressao
  que codifica o comportamento novo nao protege nada.
- **Tightenings deliberados** (rotas que estavam largas demais e agora fecham):
  notas/senha/reenvio de e-mail do aluno e a busca global de alunos saem do
  `requirePmbTeam` (que aceitava ate o Designer) e passam a exigir
  `alunosRede.*`; o export de comissoes/saques exige `indicacoes.view`; o
  cancelamento de matricula de aluno de unidade exige `unidades.manage`.
  A aba "Exportacoes" dos relatorios some para gerente de vendas, vendedor de
  revenda e financeiro — a API de export nunca os atendeu (403). Escritas
  destrutivas que estavam sob permissao de leitura foram movidas para a de
  escrita (`artes.manage`, `vendas.create`), e trocar o token do Mercado Pago
  passou a exigir `integracoes.manage` (a tela ja escondia o campo; so o PATCH
  direto passava).

### Bugs conhecidos (pendentes)

- **Middleware file convention deprecado** no Next 16 (usar `proxy` em vez de `middleware`).
- Consultor (TenantMember) nao popula `session.user.tenantId` no JWT — cap de desconto e validado server-side via lookup de TenantMember na API.
- `npm run build` local para em "Collecting page data" por falta de `DATABASE_URL`: as envs Sensitive da Vercel nao descem no `vercel env pull`. Compile + typecheck passam; para fechar o build localmente, exporte um `DATABASE_URL` qualquer.

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
| `docs/api/plataforma-parceira-api-completa.md` | Todos os 21 endpoints da API da plataforma parceira com params, responses e cuidados |
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
    │   ├── plataforma-cursos/         # Client API da plataforma parceira (form-data!)
    │   ├── asaas/                   # Client API Asaas
    │   ├── mercadopago/             # Client API MP
    │   └── tenant/                  # Resolver multi-tenant
    ├── hooks/                       # React hooks
    ├── stores/                      # Zustand stores
    ├── types/                       # Tipos globais
    └── middleware.ts                # MIDDLEWARE MULTI-TENANT (CRITICO)
```

## Arquitetura Multi-Tenant (MAIS IMPORTANTE DO SISTEMA)

A plataforma usa **dois dominios distintos** (proxy em `src/proxy.ts`):

| Hostname | O que renderiza |
|---|---|
| `profissionalizamaisbrasil.com.br` (e `www`) | Site PMB institucional + `/admin` + `/painel` + `/aluno` + `/loja` direto. **Subdominios aqui sao sempre reservados (www, app, api, ...) — nunca tenant.** |
| `livrecursos.com.br` (e `www`) | Landing dedicada a captacao de revendedores (rewrite para `/livrecursos`). |
| `{slug}.livrecursos.com.br` | Vitrine do revendedor `{slug}` (rewrite para `/loja/*`). |
| `dominio-custom.com.br` | Vitrine do revendedor que configurou dominio proprio (lookup por `customDomain` no banco). |

**Helpers obrigatorios em `src/lib/tenant/urls.ts`** — sempre use estas funcoes em vez de concatenar strings de dominio:

- `appDomain()` → `profissionalizamaisbrasil.com.br`
- `vitrineDomain()` → `livrecursos.com.br`
- `appUrl()` → `https://profissionalizamaisbrasil.com.br`
- `vitrineHost(slug)` → `{slug}.livrecursos.com.br`
- `vitrineUrl(slug)` → `https://{slug}.livrecursos.com.br`
- `cnameTarget()` → `cname.livrecursos.com.br` (alvo CNAME para custom domains)

**Implementacao detalhada em:** `docs/architecture/DOMINIOS-GUIDE.md`

**Regras:**
- Proxy roda no Edge Runtime — NAO pode usar Prisma direto
- Usar Upstash Redis como cache (funciona no Edge) + Supabase client como fallback
- TTL do cache: 5 minutos
- Subdominios reservados em livrecursos.com.br: www, app, api, admin, painel, mail, smtp, ftp, cdn, assets, static, staging, dev, test
- TODA query no contexto da vitrine DEVE filtrar por tenant_id
- NUNCA permitir acesso cross-tenant
- Cookies de sessao sao automaticamente isolados pelos dominios (PMB e livrecursos nao compartilham sessao)

## Integracoes API — Resumo Rapido

### plataforma parceira (form-data, NAO JSON!)
- Base: `https://SUAESCOLA.com/api/v2/`
- Auth: Token via form-data
- **Doc completa:** `docs/api/plataforma-parceira-api-completa.md`
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
→ POST plataforma usuarios/novo {polo, vendedor, status:"ativo", apostila:"liberar"}
→ POST plataforma usuarios/vinculocurso {aluno, idcurso}
→ POST plataforma usuarios/envioemail {aluno}
→ Salvar enrollment no banco
```

### Bloqueio por Inadimplencia
```
MP webhook falhou → checar tenant.billing_mode
→ AUTO: POST plataforma usuarios/editar {status:"bloqueado", apostila:"bloquear"}
→ MANUAL: notificar revendedor
```

### Onboarding Revendedor
```
POST Asaas customers → POST Asaas subscriptions
→ Webhook PAYMENT_RECEIVED
→ POST plataforma funcionarios/novo → vendedor_id
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
NEXT_PUBLIC_VITRINE_DOMAIN=livrecursos.com.br

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

# plataforma parceira
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
