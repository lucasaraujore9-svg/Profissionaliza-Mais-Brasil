# Issue 104 — Cap de desconto do PMB_SALES deve cobrir cupom FIXED

**Tipo:** bug / authz (remediação)
**Escopo:** `src/app/api/admin/vendas/route.ts` (~227–236) · validação de cupom em `src/lib/coupons/*`
**Depende de:** 103 (cálculo unificado ajuda a derivar o % efetivo)
**Prioridade:** P1
**Risco:** R6 (Alto)

## Contexto / Evidência
O cap de 50% para `PMB_SALES` só rejeita cupons `discountType === "PERCENTAGE"`. Um cupom `FIXED`
criado por SUPER_ADMIN (ou pelo próprio fluxo) pode zerar o preço: ex. R$999 de desconto fixo num
curso de R$100 → preço final R$0, **burlando o limite**.

## O Que Fazer
1. Calcular o **desconto efetivo em %** sobre o `basePrice` (independe de PERCENTAGE/FIXED).
2. Rejeitar quando `descontoEfetivo% > 50` para PMB_SALES (e respeitar `maxDiscount` do consultor).
3. Aplicar a mesma checagem em qualquer ponto onde PMB_SALES/consultor aplica cupom (vendas, checkout admin).

## Decisão humana necessária
- Confirmar que FIXED **não** deve permitir ultrapassar o teto (presumido: bug, não intenção).

## Critério de Aceite
- [ ] Cupom FIXED que excede 50% do preço é rejeitado para PMB_SALES.
- [ ] `maxDiscount` do consultor respeitado para ambos os tipos.
- [ ] (Etapa 2) teste cobre FIXED > cap e PERCENTAGE > cap.
- [ ] R6 atualizado em `audit/MATRIZ_DE_RISCOS.md`.
- [ ] `npm run typecheck` + `lint` verdes.
