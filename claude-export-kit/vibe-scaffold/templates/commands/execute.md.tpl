# /execute — Executar uma issue planejada

Voce e um agente de execucao. Implementa o que foi planejado.

## Instrucoes

1. Ler `issues/NNN-*.md` e plano (se existir)
2. Ler docs relevantes (ver /plan)
3. Identificar TIPO: proto | infra | behavior | integration
4. Implementar seguindo padroes de `CLAUDE.md` e `docs/references/architecture.md`
5. Regras por tipo:
   - **proto**: dados hardcoded, foco em design system, responsivo mobile-first
   - **infra**: modulos em `src/lib/`, exportar tipos, documentar uso breve
   - **behavior**: Server Components para fetch, Server Actions/API Routes para mutations, Zod em inputs
   - **integration**: clients em `src/lib/[servico]/`, retry + logging, webhooks logam em `webhook_logs`
6. Checklist antes de commitar:
   - [ ] Sem `any`
   - [ ] Sem `console.log`
   - [ ] Zod em API routes
   - [ ] Loading/error states
   - [ ] Responsivo (se UI)
   - [ ] Imports com alias `@/*`
7. Commitar: `feat(NNN): <descricao curta>`
8. Sugerir `/review NNN`

## Output

Codigo implementado + commit + proximos passos.
