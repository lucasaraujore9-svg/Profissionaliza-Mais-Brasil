# Issue 118 — Carregar analytics/tracking só após consentimento de cookies

**Tipo:** lgpd (remediação)
**Escopo:** `src/app/layout.tsx` (~110–111) · componente de banner de cookies · `@vercel/analytics`/`@vercel/speed-insights` · `src/app/api/public/capture-ref`
**Depende de:** nenhuma
**Prioridade:** P1
**Risco:** R15 (Alto)

## Contexto / Evidência
Vercel Analytics/Speed Insights carregam **incondicionalmente** no `layout.tsx`, ignorando a escolha
do usuário no banner de cookies — divergência entre a política de privacidade declarada e o
comportamento técnico. O `capture-ref` também registra tracking.

## O Que Fazer
1. Condicionar o carregamento de `@vercel/analytics` e `@vercel/speed-insights` ao **consentimento**
   registrado pelo banner (estado em cookie/localStorage).
2. Garantir que `capture-ref`/tracking só ocorre com consentimento (ou enquadrar em legítimo interesse
   documentado, conforme decisão jurídica).
3. Permitir revogar consentimento.

## Decisão humana necessária
- Base legal do tracking de `ref` (consentimento vs legítimo interesse) — **jurídico**.

## Critério de Aceite
- [ ] Sem consentimento → analytics/speed-insights não carregam.
- [ ] Consentimento persistido e revogável.
- [ ] Comportamento alinhado à Política de Privacidade publicada.
- [ ] R15 atualizado em `audit/MATRIZ_DE_RISCOS.md`.
- [ ] `npm run typecheck` + `lint` verdes.
