# Issue 110 — Testes dos fluxos críticos (dinheiro, matrícula, acesso)

**Tipo:** test (remediação)
**Escopo:** `src/lib/coupons/*` · `src/lib/mercadopago/webhook.ts` · `src/app/api/cron/sweep-students-overdue/route.ts` · `src/lib/validation/cpf.ts` · `src/lib/crypto.ts` · `src/lib/enrollment/fulfill.ts` · `src/lib/auth/guards.ts` · e2e de login/IDOR/checkout
**Depende de:** 109
**Prioridade:** P1
**Risco:** confiabilidade dos fluxos de dinheiro/matrícula

## Prioridades (do relatório 10-testes)
1. **Unit** `applyCouponDiscount` — PERCENTAGE, FIXED, cap, arredondamento (protege R5/R6).
2. **Unit** `validateMpWebhookSignature` — HMAC válido/forjado (matrícula fraudulenta).
3. **Unit** `addMonthsClamped` — dias 28–31 (protege R7).
4. **Unit** `isValidCpf` + `encrypt`/`decrypt` roundtrip.
5. **Integration** idempotência de `fulfillEnrollment` — replay de webhook → no-op (sem matrícula/email duplicado).
6. **Integration** tenant-scoping dos guards — RESELLER não acessa outro tenant.
7. **e2e** Playwright: login por papel; acesso negado por role; IDOR aluno A↔B; checkout feliz.

## O Que Fazer
- Implementar os testes acima (esqueletos no relatório `audit/agent-reports/10-testes.md`).
- Cobrir explicitamente os bugs corrigidos nas issues 102–105 (teste de regressão).

## Critério de Aceite
- [ ] Testes 1–6 implementados e verdes.
- [ ] Ao menos 3 cenários e2e (login papel, acesso negado, IDOR) verdes.
- [ ] Testes de regressão para R2, R5, R6, R7 (issues 102–105).
- [ ] Cobertura mínima reportada nos módulos de cupom/cripto/inadimplência.
- [ ] CI verde com os novos testes.
