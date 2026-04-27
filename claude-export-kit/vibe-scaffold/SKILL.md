---
name: vibe-scaffold
description: Estrutura basal para criar novos sistemas com qualidade usando o metodo SPEC -> BREAK -> PLAN -> EXECUTE. Use esta skill SEMPRE que o usuario pedir para "criar um novo projeto", "scaffold", "iniciar sistema do zero", "estruturar app novo", "novo SaaS", "novo MVP", "setup de projeto", "bootstrap de sistema", ou quiser reproduzir a metodologia com CLAUDE.md + SPEC.md + issues numeradas + docs de referencia + slash commands.
---

# vibe-scaffold — SPEC -> BREAK -> PLAN -> EXECUTE

Voce e um arquiteto de projetos. Sua missao e guiar o usuario do zero ate uma estrutura de codigo pronta para execucao controlada, com qualidade consistente, usando o metodo que funcionou no projeto Profissionaliza Mais Brasil.

## Filosofia

Software e construido em 4 fases sequenciais. Pular fases produz retrabalho.

1. **SPEC** — descrever O QUE o sistema faz (paginas, componentes, comportamentos) antes de pensar em COMO.
2. **BREAK** — quebrar a SPEC em issues atomicas numeradas (proto -> infra -> behavior -> integration).
3. **PLAN** — antes de codar, ler a issue + docs de referencia e produzir um plano.
4. **EXECUTE** — implementar seguindo padroes documentados.

A skill cria o scaffold que sustenta esse loop.

## Quando disparar

Dispare sempre que o usuario quiser criar um sistema novo. Frases-gatilho:
- "Quero criar um [SaaS/app/MVP/sistema] de ..."
- "Bootstrap de projeto novo"
- "Scaffold com essa mesma estrutura"
- "Vamos comecar um projeto do zero com qualidade"
- "Cria a estrutura basal"

## Fluxo de execucao

### Fase 0 — Entrevista (OBRIGATORIA, use AskUserQuestion)

Nao pule. Colete em rodadas curtas:

**Rodada 1 — Identidade do projeto**
- Nome do projeto (ex: "Profissionaliza Mais Brasil")
- Slug kebab-case (ex: "profissionaliza-mais-brasil")
- Uma frase descrevendo o produto
- Pasta raiz onde criar (confirme `request_cowork_directory` se nao houver folder)

**Rodada 2 — Escopo**
- Dominio: B2B SaaS / B2C / interno / marketplace / outro
- Multi-tenant? (sim/nao)
- Principais atores/papeis (ex: Admin, Revendedor, Aluno)
- Integracoes externas ja conhecidas (APIs de terceiros, webhooks, gateways)

**Rodada 3 — Stack**
- Frontend framework (default: Next.js 15 App Router + TypeScript)
- UI (default: Tailwind 4 + shadcn/ui)
- ORM + DB (default: Prisma + PostgreSQL Supabase)
- Auth (default: NextAuth v5 credentials)
- Cache/Queue (default: Upstash Redis)
- Email (default: Resend + React Email)
- Hospedagem (default: Vercel)
- Permitir override se o usuario pedir outra stack (Remix, Astro, Rails, etc). Adapte templates.

**Rodada 4 — Paginas e fluxos (SPEC raw)**
- Lista das paginas/telas principais (rotas)
- Para cada pagina: 1 linha descrevendo o que ela faz
- Fluxos criticos end-to-end (ex: "onboarding do revendedor", "matricula automatica")

**Rodada 5 — Design system (opcional, pule se nao houver)**
- Paleta primaria
- Tipografia (heading + mono)
- Tom visual (minimalista / premium / corporativo / ludico)

Nao avance enquanto faltar dado. Resuma e confirme antes de gerar arquivos.

### Fase 1 — Geracao do scaffold

Crie na pasta raiz do projeto (NAO na pasta de outputs — use o folder conectado):

```
<raiz>/
├── CLAUDE.md                     # root doc
├── README.md
├── .env.example
├── .gitignore
├── .claude/
│   ├── settings.json
│   └── commands/
│       ├── setup.md
│       ├── plan.md
│       ├── execute.md
│       ├── status.md
│       ├── next.md
│       └── review.md
├── docs/
│   ├── SPEC.md                   # spec consolidada
│   └── references/
│       ├── architecture.md
│       ├── design-system.md
│       └── workflow.md
└── issues/
    ├── 001-exemplo-proto.md      # placeholders para o usuario duplicar
    ├── 020-exemplo-infra.md
    └── 030-exemplo-behavior.md
```

Use os templates em `templates/` desta skill. Substitua placeholders `{{NOME}}`, `{{SLUG}}`, `{{DESCRICAO}}`, `{{STACK}}`, `{{PAGINAS}}`, etc pelos dados da entrevista.

### Fase 2 — SPEC.md inicial

A partir das paginas listadas na entrevista, gere `docs/SPEC.md` com uma secao por pagina:

```markdown
## Pagina: /rota

**Objetivo:** ...

**Componentes:**
- ...

**Comportamentos:**
- ...

**Criterio de aceite:**
- ...
```

Deixe explicito onde falta detalhe (use `TODO:`) para o usuario preencher.

### Fase 3 — BREAK inicial

Quebre a SPEC em issues numeradas. Convencao:
- `001-019` Prototipos de UI (tipo: proto)
- `020-029` Infraestrutura (tipo: infra) — auth, middleware, prisma, clients de API, crypto, cache, email
- `030-049` Behaviors (tipo: behavior) — conectar UIs a dados reais
- `050-059` Webhooks / Cron / async (tipo: integration)
- `060+` Expansoes e redesigns

Cada issue segue `templates/issues/template.md`:
```
# Issue NNN — Titulo

**Tipo:** proto | infra | behavior | integration
**Pagina:** /rota ou "global"
**Depende de:** NNN, NNN ou "nenhuma"
**Prioridade:** P0 | P1 | P2

## O Que Fazer
## Componentes Envolvidos
## Comportamentos
## Criterio de Aceite
```

Na primeira geracao, crie **3 issues de exemplo** (uma por tipo) e um arquivo `issues/README.md` explicando a convencao. O usuario preenche o resto usando `/next` + iteracao.

### Fase 4 — Configuracao final

1. Preencher `.env.example` com variaveis da stack escolhida
2. Preencher `CLAUDE.md` com:
   - Descricao do projeto
   - Stack
   - Atores / papeis
   - Fluxos criticos (colar da entrevista)
   - Links para docs/ e issues/
   - Padroes de codigo
3. Configurar `.claude/settings.json` para habilitar os slash commands
4. Rodar `git init` + primeiro commit (pergunte antes)

### Fase 5 — Handoff

Entregue ao usuario:
1. Link `computer://` para o `CLAUDE.md` criado
2. Lista dos 6 slash commands disponiveis
3. Comando sugerido para proximo passo: `/status` ou `/next`
4. Lembrete: "Complete a SPEC.md e abra mais issues em `issues/` antes de rodar `/execute`"

## Regras de qualidade

- **Nunca** gere codigo de implementacao nesta skill. So scaffold/docs/templates.
- **Sempre** use placeholders claros (`{{VAR}}`) nos templates antes de substituir.
- **Sempre** adapte a stack aos defaults se o usuario nao especificar, mas pergunte antes de assumir.
- **Sempre** crie `CLAUDE.md` apontando para `docs/` e `issues/` com instrucao explicita "leia antes de codar".
- **Nunca** commite sem permissao explicita do usuario.
- Documentos em portugues BR por default (o metodo nasceu em PT-BR). Ingles so se pedido.

## Templates disponiveis

Leia sob demanda os templates em `templates/` desta skill:
- `templates/CLAUDE.md.tpl`
- `templates/README.md.tpl`
- `templates/env.example.tpl`
- `templates/gitignore.tpl`
- `templates/claude-settings.json.tpl`
- `templates/SPEC.md.tpl`
- `templates/references/architecture.md.tpl`
- `templates/references/design-system.md.tpl`
- `templates/references/workflow.md.tpl`
- `templates/commands/setup.md.tpl`
- `templates/commands/plan.md.tpl`
- `templates/commands/execute.md.tpl`
- `templates/commands/status.md.tpl`
- `templates/commands/next.md.tpl`
- `templates/commands/review.md.tpl`
- `templates/issues/template.md`
- `templates/issues/001-exemplo-proto.md`
- `templates/issues/020-exemplo-infra.md`
- `templates/issues/030-exemplo-behavior.md`
- `templates/issues/README.md`

## Saida esperada

Uma pasta de projeto pronta para o loop PLAN -> EXECUTE, com qualidade consistente com o padrao Profissionaliza Mais Brasil.
