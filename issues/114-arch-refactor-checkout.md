# Issue 114 — Extrair helper único de checkout e eliminar duplicações

**Tipo:** arch / refactor (remediação)
**Escopo:** `src/app/api/checkout/route.ts` · `src/app/api/loja/checkout/route.ts` · `src/app/api/aluno/comprar/route.ts` · `src/app/api/admin/vendas/route.ts` · `src/lib/enrollment/*` · `src/lib/mercadopago/*` · `src/lib/automation/leads.ts`
**Depende de:** 102, 103 (correções de bug primeiro; este refactor consolida para não regredir)
**Prioridade:** P2
**Risco:** R29 (Médio) — causa-raiz de R2/R5

## Contexto / Evidência
As 4 rotas de checkout estão ~60% duplicadas (711 + 443 + 413 linhas); `dueDateInDays` está
duplicada verbatim em 3 rotas; `normalizeE164` reimplementada em `pmb/leads` e `loja/leads`
ignorando `automation/leads.ts:238`; `TenantContext` está **bifurcado** em `fulfill.ts:40` e
`process.ts:39` com campos divergentes. Essa duplicação foi o que permitiu R2/R5 existirem só em
algumas rotas.

## O Que Fazer
1. Extrair um módulo `src/lib/checkout/*` com: criação de enrollment + aplicação de cupom (Decimal) +
   criação de preference/preapproval + rollback em erro (consolidando o fix de 102/103).
2. Unificar `dueDateInDays` e `normalizeE164` em um único helper.
3. Unificar `TenantContext` num tipo só (superset dos campos), eliminando a bifurcação.
4. Migrar as 4 rotas para o módulo comum.

## Critério de Aceite
- [ ] Lógica de checkout num único módulo reutilizado pelas 4 rotas.
- [ ] `dueDateInDays`, `normalizeE164`, `TenantContext` sem duplicação.
- [ ] Comportamento idêntico (testes de 110 cobrem regressão).
- [ ] R29 atualizado em `audit/MATRIZ_DE_RISCOS.md`.
- [ ] `npm run typecheck` + `lint` verdes.
