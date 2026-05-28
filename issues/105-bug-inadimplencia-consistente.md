# Issue 105 — Inadimplência consistente: clamp de data + bloqueio na plataforma parceira

**Tipo:** bug (remediação)
**Escopo:** `src/app/api/cron/sweep-students-overdue/route.ts` (115–116) · `src/lib/asaas/process.ts` (182–190) · `src/lib/enrollment/*` (`blockStudentInEA`)
**Depende de:** nenhuma
**Prioridade:** P1
**Risco:** R7 (Alto) + R8 (Alto)

## Contexto / Evidência
- **R7:** o cálculo `stillActive` (decide se o aluno tem outro curso em dia) usa `due.setMonth(...)`
  nativo, com **overflow de mês**, enquanto o cálculo principal usa `addMonthsClamped` definido no
  mesmo arquivo. Para `startedAt` no dia 31, o bloqueio do inadimplente atrasa ~1 mês.
- **R8:** no branch `processPmbDirectSale` (venda direta PMB via Asaas), ao receber `PAYMENT_OVERDUE`
  o código só marca `enrollment.SUSPENDED` no banco (com `swallow`), mas **não chama
  `blockStudentInEA`**. O aluno mantém acesso na plataforma parceira até o sweep rodar (até ~5 dias).

## O Que Fazer
1. Trocar `setMonth` por `addMonthsClamped` em `sweep-students-overdue:115-116`.
2. No `processPmbDirectSale` com `PAYMENT_OVERDUE`, chamar `blockStudentInEA` além de marcar
   `SUSPENDED` (respeitando `billingMode`/período de graça aplicável).
3. Conferir que `swallow` não está engolindo erro de bloqueio relevante — logar como erro se a chamada à plataforma falhar.

## Critério de Aceite
- [ ] Bloqueio de inadimplente não atrasa para `startedAt` em dia 31.
- [ ] OVERDUE de venda direta PMB bloqueia o aluno na plataforma parceira.
- [ ] Falha de bloqueio na plataforma é logada (não silenciosa).
- [ ] (Etapa 2) teste unitário de `addMonthsClamped` (dias 28–31).
- [ ] R7/R8 atualizados em `audit/MATRIZ_DE_RISCOS.md`.
- [ ] `npm run typecheck` + `lint` verdes.
