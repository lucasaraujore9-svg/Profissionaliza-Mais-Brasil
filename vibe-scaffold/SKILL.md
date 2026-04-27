---
name: vibe-scaffold
description: >
  Estrutura basal para criar novos sistemas com qualidade usando o metodo SPEC -> BREAK -> PLAN -> EXECUTE.
  Use esta skill SEMPRE que o usuario pedir para "criar um novo projeto", "scaffold", "iniciar sistema do zero",
  "estruturar app novo", "novo SaaS", "novo MVP", "setup de projeto", "bootstrap de sistema", "vibecoder",
  "criar estrutura basal", "comecar projeto com qualidade", ou quiser reproduzir a metodologia com
  CLAUDE.md + SPEC.md + issues numeradas + docs de referencia + slash commands.
  Triggers on: novo projeto, scaffold, estrutura basal, bootstrap, vibecoder, MVP, novo SaaS, setup projeto,
  criar sistema, iniciar app, projeto do zero, SPEC BREAK PLAN EXECUTE, CLAUDE.md, issues, slash commands,
  criar estrutura, metodologia de projeto, projeto estruturado, qualidade de codigo.
---

# vibe-scaffold — Squad de Arquitetura de Projetos

Squad de 6 agentes especializados que constroem a fundacao de qualquer sistema novo usando o metodo
SPEC -> BREAK -> PLAN -> EXECUTE. Garante qualidade consistente desde o dia zero.

## How to use this skill

This skill contains a squad of 6 agents organized in 2 tiers.

**Workflow:**
1. Analyze the user's request to determine the project scope
2. Read `config/config.yaml` for squad structure
3. The Chief Architect (Tier 0) conducts the interview and routes to specialists
4. Specialists generate their deliverables following frameworks
5. Review output against `checklists/output-quality.md` before delivery

**Entry point:** Always start with the Chief Architect (`agents/chief-architect.md`)

## Agent roster

- **chief-architect** — Chief Architect (Tier 0): Orchestrador. Conduz entrevista, diagnostica escopo, roteia para especialistas, monta entrega final.
- **spec-writer** — Spec Writer (Tier 1): Especialista em SPEC. Transforma entrevista em documento SPEC.md completo com paginas, componentes, comportamentos e criterios de aceite.
- **issue-breaker** — Issue Breaker (Tier 1): Especialista em decomposicao. Quebra a SPEC em issues atomicas numeradas (proto -> infra -> behavior -> integration) com dependencias corretas.
- **doc-architect** — Doc Architect (Tier 1): Especialista em documentacao de referencia. Gera CLAUDE.md, architecture.md, design-system.md, workflow.md adaptados ao projeto.
- **command-smith** — Command Smith (Tier 1): Especialista em slash commands. Cria os 6 comandos (/setup, /plan, /execute, /status, /next, /review) calibrados para o projeto.
- **scaffold-builder** — Scaffold Builder (Tier 1): Especialista em estrutura de arquivos. Gera .env.example, .gitignore, README.md, settings.json e cria a arvore de pastas do projeto.

## Routing guide

When the user's request arrives, the Chief Architect matches it to the right flow.
Consult `data/routing-catalog.yaml` for detailed routing rules.

**Quick routing:**
- "Criar novo projeto/app/SaaS" → Full workflow (all agents)
- "Gerar SPEC" → spec-writer only
- "Quebrar em issues" → issue-breaker (needs SPEC)
- "Criar CLAUDE.md" → doc-architect only
- "Gerar slash commands" → command-smith only
- "Montar estrutura de pastas" → scaffold-builder only

## Available tasks

- `tasks/full-scaffold.md` — Scaffold completo (entrevista → SPEC → issues → docs → commands → arquivos)
- `tasks/spec-only.md` — Gerar apenas SPEC.md a partir de entrevista
- `tasks/break-only.md` — Quebrar SPEC existente em issues
- `tasks/docs-only.md` — Gerar documentacao de referencia
- `tasks/commands-only.md` — Gerar slash commands

## Workflows

- `workflows/wf-full-project.yaml` — Workflow completo: entrevista → 5 fases sequenciais
- `workflows/wf-incremental.yaml` — Adicionar issues/docs a projeto existente

## Reference data

- `data/routing-catalog.yaml` — Mapa de keywords para agentes
- `data/frameworks.yaml` — Frameworks e metodologias usadas (SPEC-BREAK-PLAN-EXECUTE, issue taxonomy, etc)

## Templates

Templates usados pelos agentes para gerar arquivos:
- `templates/CLAUDE.md.tpl` — Root doc do projeto
- `templates/SPEC.md.tpl` — Spec consolidada
- `templates/references/architecture.md.tpl` — Padroes de arquitetura
- `templates/references/design-system.md.tpl` — Design system
- `templates/references/workflow.md.tpl` — Workflow detalhado
- `templates/commands/*.tpl` — 6 slash commands
- `templates/issues/template.md` — Template de issue
- `templates/issues/README.md` — Convencao de issues

## Quality checklists

- `checklists/output-quality.md` — Review antes de entregar qualquer output
