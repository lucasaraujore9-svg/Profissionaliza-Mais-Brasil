# Issue 106 — Rate-limit nas entradas faltantes (checkout PMB, troca de senha, uploads)

**Tipo:** sec (remediação)
**Escopo:** `src/app/api/checkout/route.ts` · `src/app/api/auth/alterar-senha-inicial/route.ts` · `src/app/api/admin/**/upload/route.ts` (certificate-template, banner, system-settings/group-logo) · `src/app/api/painel/**/upload/route.ts` · `src/lib/ratelimit.ts`
**Depende de:** nenhuma
**Prioridade:** P1
**Risco:** R9 (Alto) + R11 (Alto) + R19 (Médio)

## Contexto / Evidência
- **R9:** `/api/checkout` (vitrine PMB, pública, cria cobranças Asaas/MP) **não tem rate-limit** —
  `/api/loja/checkout` tem. Bot pode floodar e gerar custo + lixo no banco.
- **R11:** `alterar-senha-inicial` (troca obrigatória) sem rate-limit e sem exigir senha atual.
- **R19:** rotas de upload admin/painel sem rate-limit (apenas `painel/vitrine/upload` tem).

## O Que Fazer
1. Aplicar `RATE_LIMITS.publicCheckout` em `/api/checkout` (igual `loja/checkout`).
2. Aplicar `RATE_LIMITS.authReset` (ou novo bucket) em `alterar-senha-inicial`; avaliar exigir senha atual.
3. Aplicar `RATE_LIMITS.upload` em todas as rotas de upload admin/painel.
4. Confirmar `rateLimitResponse` (429) consistente.

## Critério de Aceite
- [ ] `/api/checkout` retorna 429 ao exceder limite.
- [ ] `alterar-senha-inicial` com rate-limit (+ decisão sobre senha atual).
- [ ] Todas as rotas de upload com rate-limit.
- [ ] R9/R11/R19 atualizados em `audit/MATRIZ_DE_RISCOS.md`.
- [ ] `npm run typecheck` + `lint` verdes.
