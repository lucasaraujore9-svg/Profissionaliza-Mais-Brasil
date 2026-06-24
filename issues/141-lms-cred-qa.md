# Issue 141 — QA / Portão Zero-Erro

**Tipo:** test
**Escopo:** `tests` + validação manual
**Depende de:** 130–140
**Prioridade:** P0

## Contexto

Nada é "pronto" sem o Portão Zero-Erro verde (guardrail do projeto).

## O que fazer

- `npm install --frozen-lockfile` → `npx prisma generate` → `npx tsc --noEmit` (zero) → `npm run lint` →
  `npm run build` (aplica migration) → testes.
- Teste novo: **re-entrega de webhook MP não duplica nem apaga a credencial**.
- Manual: own (SSO), parceiro (card+portal), pacote misto, branding na criação/edição, `decrypt` corrompido →
  `null`.

## Critérios de Aceite

- [ ] typecheck/lint/build/test verdes
- [ ] Senha nunca em log/URL/`NEXT_PUBLIC_*`
- [ ] `lmsSenha` no banco está **cifrada**
