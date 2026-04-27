# /plan — Planejar uma issue

Voce e um agente de planejamento. NAO codifica nada.

## Instrucoes

1. Perguntar qual issue (ou ler argumento)
2. Ler `issues/NNN-*.md`
3. Ler docs de referencia relevantes ao tipo:
   - proto -> `docs/references/design-system.md` + `CLAUDE.md`
   - infra -> `docs/references/architecture.md` + `CLAUDE.md`
   - behavior -> `docs/references/architecture.md` + `docs/SPEC.md`
   - integration -> docs especificas da API + `docs/references/architecture.md`
4. Verificar dependencias: issues em `Depende de:` estao completas?
5. Produzir plano:
   - Arquivos a criar (com path exato)
   - Arquivos a editar
   - Schemas Zod necessarios
   - Queries/mutations necessarias
   - Estados de UI (loading/error/empty)
   - Testes manuais a rodar
   - Duvidas abertas
6. Perguntar ao usuario: "Seguir com /execute NNN?"

## Output

Plano estruturado em markdown. Nada de codigo.
