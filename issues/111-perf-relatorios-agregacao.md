# Issue 111 — Performance: limites, agregação em SQL e batch de notificações

**Tipo:** perf (remediação)
**Escopo:** `src/lib/reports/definitions.ts` · `src/app/api/admin/analytics/route.ts` · `src/app/api/admin/notifications/broadcast/route.ts` · `src/lib/notifications/*` · `src/app/api/admin/dashboard/route.ts`
**Depende de:** nenhuma
**Prioridade:** P1
**Risco:** R16 (Alto)

## Contexto / Evidência
- **Relatórios:** ~15 `findMany` **sem `take`** — exportam tabelas inteiras (risco de OOM/timeout).
- **Broadcast `scope=ALL`** (`broadcast/route.ts:152` + `notifications.ts:135`): carrega todos os alunos
  sem paginação + **N+1** (3 queries por aluno via `isChannelEnabled`/`isStudentCategoryEnabled`).
- **Analytics** (`analytics/route.ts:72-79`): 2 `findMany` trazem 180 dias de payments/enrollments
  para agrupar por mês em JS, quando o Postgres faz com `date_trunc ... GROUP BY` (padrão já usado no dashboard).

## O Que Fazer
1. Adicionar `take`/paginação (cursor) aos `findMany` de relatórios; streaming/lotes para export grande.
2. Converter o agrupamento do analytics para SQL (`date_trunc` + `GROUP BY`) — eliminar carga em memória.
3. Broadcast: buscar destinatários em lotes e usar `createMany`; pré-carregar configs de canal/categoria
   em 1 query (eliminar N+1) ou cachear.
4. Declarar `maxDuration` adequado nas rotas pesadas.

## Critério de Aceite
- [ ] Nenhum `findMany` de relatório sem limite/paginação.
- [ ] Analytics agrega no SQL (sem 180 dias em memória).
- [ ] Broadcast sem N+1 e com `createMany` em lotes.
- [ ] Teste manual com volume sintético (ex: 10k alunos) sem timeout/OOM.
- [ ] R16 atualizado em `audit/MATRIZ_DE_RISCOS.md`.
- [ ] `npm run typecheck` + `lint` verdes.
