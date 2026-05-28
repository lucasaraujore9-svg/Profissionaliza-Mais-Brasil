# Issue 103 — Unificar cálculo de desconto de cupom em Decimal

**Tipo:** bug (remediação)
**Escopo:** `src/app/api/checkout/route.ts` (~241–256) · `src/app/api/admin/vendas/route.ts` · helper `applyCouponDiscount` (`src/lib/coupons/*`)
**Depende de:** nenhuma
**Prioridade:** P1
**Risco:** R5 (Alto)

## Contexto / Evidência
`/api/checkout` e `/api/admin/vendas` calculam o desconto com **aritmética float**:
`(basePrice * Number(discountValue)) / 100`, em vez de usar `applyCouponDiscount` (helper com
`Prisma.Decimal` e `ROUND_HALF_EVEN`) já adotado em `loja/checkout` e `aluno/comprar`. Resultado:
**divergência de centavos** entre o valor cobrado no gateway e o registrado nos relatórios
financeiros.

## O Que Fazer
1. Substituir o cálculo inline pelas chamadas a `applyCouponDiscount` nas duas rotas.
2. Garantir que o valor enviado ao MP/Asaas e o valor persistido (Payment/Enrollment) usam **a mesma**
   fonte (o resultado Decimal).
3. Conferir formatação BR onde o gateway exige (a doc alerta "preços em formato BR").

## Critério de Aceite
- [ ] As 4 rotas de checkout usam `applyCouponDiscount`.
- [ ] Valor cobrado == valor persistido == valor no relatório (sem divergência de centavos).
- [ ] (Etapa 2) teste unitário de `applyCouponDiscount` cobre PERCENTAGE e FIXED, arredondamento.
- [ ] R5 atualizado em `audit/MATRIZ_DE_RISCOS.md`.
- [ ] `npm run typecheck` + `lint` verdes.
