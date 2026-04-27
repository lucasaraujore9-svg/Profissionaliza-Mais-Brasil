# Workflow — SPEC -> BREAK -> PLAN -> EXECUTE

## 1. SPEC

Descrever O QUE o produto faz, nao COMO.

Por pagina:
- Objetivo em 1 frase
- Componentes visuais
- Comportamentos (o que acontece ao interagir)
- Criterio de aceite

Arquivo: `docs/SPEC.md`.

## 2. BREAK

Quebrar a SPEC em issues atomicas. Uma issue = uma PR mental.

Convencao:
- `001-019` proto (UI hardcoded)
- `020-029` infra (auth, db, middleware, clients, crypto, cache)
- `030-049` behavior (conectar UI a dados reais)
- `050-059` integration (webhooks, cron, async)
- `060+` expansoes

Template em `issues/template.md`. Campos obrigatorios: Tipo, Pagina, Depende de, Prioridade, O Que Fazer, Componentes, Comportamentos, Criterio de Aceite.

## 3. PLAN

Antes de codar:
1. `/plan NNN`
2. Ler issue + docs de referencia relevantes
3. Listar arquivos a criar/editar
4. Listar duvidas abertas
5. Confirmar com usuario antes de executar

## 4. EXECUTE

`/execute NNN`:
1. Seguir o plano
2. Respeitar padroes de `CLAUDE.md` e `references/architecture.md`
3. Validar inputs com Zod
4. Tratar loading/error states
5. Commit ao final: `feat(NNN): descricao curta`

## 5. REVIEW

`/review NNN` apos executar. Checklist em `commands/review.md`.

## Regras de ouro

- Nunca pular PLAN.
- Nunca codar fora de uma issue.
- Se aparecer trabalho novo durante a execucao, abrir issue nova em vez de inchar a atual.
- SPEC e viva: atualizar quando o produto evoluir.
