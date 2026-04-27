# CLAUDE.md — {{NOME}}

> **Leia este arquivo INTEIRO antes de executar qualquer tarefa.**
> Documentacao detalhada esta em `/docs/`. Issues em `/issues/`. Consulte antes de implementar.

## O Que E Este Projeto

{{DESCRICAO}}

**Atores:**
{{ATORES}}

**Fluxos criticos:**
{{FLUXOS}}

## Stack

{{STACK}}

## Workflow: SPEC -> BREAK -> PLAN -> EXECUTE

Este projeto segue um workflow estruturado. **NUNCA comece a codificar sem seguir estes passos.**

1. **SPEC** — Funcionalidades documentadas em `docs/SPEC.md` (paginas, componentes, comportamentos)
2. **BREAK** — SPEC quebrada em issues individuais em `issues/` (proto -> infra -> behavior -> integration)
3. **PLAN** — Antes de codar, use `/plan NNN` para ler a issue + docs e planejar
4. **EXECUTE** — Use `/execute NNN` para implementar

### Slash Commands

| Comando | O que faz |
|---------|-----------|
| `/setup` | Inicializar projeto (deps, db, seed) |
| `/plan` | Planejar uma issue |
| `/execute` | Executar uma issue |
| `/status` | Ver progresso |
| `/next` | Sugerir proxima issue |
| `/review` | Revisar codigo |

### Ordem de Execucao

1. **Infra (020-029)**: fundacao — auth, db, middleware, clients, crypto, cache
2. **Protos (001-019)**: UI com dados hardcoded, design system
3. **Behaviors (030-049)**: conectar UIs a dados reais
4. **Integration (050-059)**: webhooks, cron, async
5. **Expansoes (060+)**: redesigns, novas features

## Documentacao Essencial

| Arquivo | O que contem |
|---------|-------------|
| `docs/SPEC.md` | SPEC COMPLETA: paginas, componentes, comportamentos |
| `docs/references/architecture.md` | Padroes de arquitetura |
| `docs/references/design-system.md` | Tipografia, cores, componentes, layouts |
| `docs/references/workflow.md` | Workflow SPEC->BREAK->PLAN->EXECUTE detalhado |
| `issues/` | Issues numeradas com tipo, deps, componentes, criterio de aceite |

## Padroes de Codigo

- TypeScript strict (sem `any`)
- Componentes: PascalCase, um por arquivo
- API Routes: validar TODOS inputs com Zod
- Erros: try/catch tipado, nunca engolir
- Segredos: NUNCA expor no client; criptografar no banco quando aplicavel
- Webhooks: logar TUDO, retornar 200 imediato, processar async
- Imports: alias `@/*` para relativos longos

{{MULTI_TENANT_BLOCK}}

## Variaveis de Ambiente

Ver `.env.example`. Nunca commitar `.env.local`.
