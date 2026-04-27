# Task: Full Scaffold

Scaffold completo — entrevista → SPEC → issues → docs → commands → arquivos.

## Pre-requisitos
- Nenhum. Este e o ponto de entrada.

## Execucao

1. **Ativar Chief Architect** (`agents/chief-architect.md`)
   - Conduzir entrevista em 5 rodadas
   - Confirmar dados com usuario

2. **Ativar Spec Writer** (`agents/spec-writer.md`)
   - Input: dados da entrevista
   - Output: `docs/SPEC.md`

3. **Ativar Issue Breaker** (`agents/issue-breaker.md`)
   - Input: SPEC.md
   - Output: `issues/*.md` + `issues/README.md`

4. **Ativar Doc Architect** (`agents/doc-architect.md`)
   - Input: entrevista + SPEC + issues
   - Output: `CLAUDE.md` + `docs/references/*.md`

5. **Ativar Command Smith** (`agents/command-smith.md`)
   - Input: stack + integracoes + multi-tenant?
   - Output: `.claude/commands/*.md`

6. **Ativar Scaffold Builder** (`agents/scaffold-builder.md`)
   - Input: stack + areas do app
   - Output: `.env.example`, `.gitignore`, `README.md`, `.claude/settings.json`, arvore de pastas

7. **Revisao final** via `checklists/output-quality.md`

8. **Handoff** ao usuario com links e proximos passos

## Duracao estimada
10-20 minutos (inclui entrevista).
