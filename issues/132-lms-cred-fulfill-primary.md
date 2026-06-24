# Issue 132 — Persistir credencial no fulfill (curso primário)

**Tipo:** behavior
**Escopo:** `src/lib/enrollment/fulfill.ts`
**Depende de:** 130, 131
**Prioridade:** P0

## Contexto

Capturar a credencial que o LMS devolve no momento da venda e gravá-la cifrada na matrícula. É o coração do
fluxo. A credencial só nasce no 1º provisionamento bem-sucedido; a recuperação fica na Issue 140.

## O que fazer

- Adicionar `import { encrypt } from "@/lib/crypto"` (fulfill hoje não importa crypto).
- Em `provisionLmsAccess`, no `enrollment.update` da `$transaction`: gravar `lmsOrigin: res.origin`,
  `lmsPlayback: res.playback` e, **quando `res.partnerAccess`**: `lmsLogin`, `lmsSenha:
  encrypt(res.partnerAccess.password)`, `lmsPortalUrl`.
- Não alterar o comportamento de `provisioning.ok=false`.
- **Nunca** logar a senha (em claro ou cifrada via objeto inteiro).

## Critérios de Aceite

- [ ] Matrícula LMS de teste preenche as colunas; `lmsSenha` fica **cifrada**
- [ ] `npx tsc --noEmit` verde
- [ ] Re-entrega de webhook (alreadyPaid) não apaga a credencial
