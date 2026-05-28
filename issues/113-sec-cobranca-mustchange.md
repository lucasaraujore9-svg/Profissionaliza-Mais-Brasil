# Issue 113 — Proteger info de cobrança (IDOR) e enforce mustChangePassword server-side

**Tipo:** sec (remediação)
**Escopo:** `src/app/api/cobranca/[paymentId]/route.ts` · `src/lib/auth/guards.ts` · layouts/guards de `/admin`, `/painel`, `/aluno`
**Depende de:** nenhuma
**Prioridade:** P2
**Risco:** R21 (Médio) + R22 (Médio)

## Contexto / Evidência
- **R21:** `GET /api/cobranca/[paymentId]` só checa `isKnownAsaasPayment`, sem token por-cobrança nem
  rate-limit — enumeração de `paymentId` vaza **valor/descrição** da cobrança (IDOR de info financeira).
- **R22:** `mustChangePassword` é enforced **só no client** (login-form). Via deep-link/API direta, um
  usuário com a flag ativa acessa recursos sem trocar a senha.

## O Que Fazer
1. `cobranca/[paymentId]`: exigir um **token por-cobrança** (assinado) na URL ou sessão do dono;
   adicionar rate-limit; não expor descrição/valor sem autorização.
2. Enforce `mustChangePassword` em guard/layout **server-side**: se a flag estiver ativa, redirecionar
   para `/alterar-senha-inicial` e bloquear rotas protegidas até a troca.

## Critério de Aceite
- [ ] `cobranca/[paymentId]` não vaza info sem token/sessão; com rate-limit.
- [ ] Usuário com `mustChangePassword` não acessa rotas protegidas via API/deep-link.
- [ ] (Etapa 2) teste e2e: deep-link bloqueado até troca de senha.
- [ ] R21/R22 atualizados em `audit/MATRIZ_DE_RISCOS.md`.
- [ ] `npm run typecheck` + `lint` verdes.
