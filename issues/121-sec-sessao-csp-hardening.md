# Issue 121 — Hardening: revogação de sessão, CSP com nonce, bcrypt/senha, replay HMAC

**Tipo:** sec (remediação)
**Escopo:** `src/lib/auth.ts` (callbacks jwt/session) · `next.config.ts` (CSP) · pontos de bcrypt (`auth.ts`, reset, invite) · `src/lib/mercadopago/webhook.ts`
**Depende de:** nenhuma
**Prioridade:** P2/P3
**Risco:** R23 (Médio) + R18 (Médio) + R35 (Baixo) + R36 (Baixo)

## Contexto / Evidência
- **R23:** JWT com `maxAge` longo (30d) sem revogação — desativar/rebaixar usuário não invalida o token
  vigente (janela de acesso pós-desativação).
- **R18:** CSP com `'unsafe-inline'` + `'unsafe-eval'` em script-src (`next.config.ts:32`) — remove a
  defesa contra XSS futuro.
- **R35:** bcrypt cost inconsistente (10 vs 12); senha mínima 6 (login) vs 8 (reset).
- **R36:** HMAC do webhook MP sem janela temporal (replay) — mitigado por idempotência.

## O Que Fazer
1. Reduzir `maxAge` da sessão e **revalidar `status`/`role`** no callback `jwt` (invalidar contas
   desativadas/rebaixadas). Avaliar lista de revogação.
2. Migrar CSP para **nonce** por request (remover `unsafe-inline`/`unsafe-eval`); ajustar SDK MP/inline
   styles para usar nonce.
3. Padronizar bcrypt **cost 12** e senha mínima **8** em todos os pontos.
4. Adicionar **janela temporal** (`ts`) na validação do HMAC MP (rejeitar timestamps antigos).

## Critério de Aceite
- [ ] Conta desativada perde acesso em curto intervalo (não 30 dias).
- [ ] CSP sem `unsafe-inline`/`unsafe-eval` (ou plano de migração com nonce funcionando).
- [ ] bcrypt cost e tamanho mínimo de senha padronizados.
- [ ] HMAC MP rejeita timestamps fora da janela.
- [ ] R23/R18/R35/R36 atualizados em `audit/MATRIZ_DE_RISCOS.md`.
- [ ] `npm run typecheck` + `lint` verdes.
