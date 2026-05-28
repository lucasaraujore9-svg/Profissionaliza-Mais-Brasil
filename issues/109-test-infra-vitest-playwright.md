# Issue 109 — Infraestrutura de testes (Vitest + Playwright) + CI

**Tipo:** test (remediação)
**Escopo:** `package.json` · `vitest.config.ts` (novo) · `playwright.config.ts` (novo) · `.github/workflows/ci.yml` · `src/test/` (helpers)
**Depende de:** nenhuma
**Prioridade:** P1
**Risco:** lacuna de qualidade (ISO 25010) — 0 testes hoje

## Contexto / Evidência
O projeto move dinheiro e matricula alunos automaticamente com **0 testes**. O CI roda apenas
lint + typecheck (audit informativo). Qualquer refatoração chega a produção sem rede de segurança.

## O Que Fazer
1. Adicionar **Vitest** (unit/integration) e **Playwright** (e2e) como devDependencies.
2. Criar `vitest.config.ts` (ambiente node, paths `@/`) e `playwright.config.ts` (baseURL configurável).
3. Scripts npm: `test`, `test:watch`, `test:e2e`, `test:coverage`.
4. Estratégia de DB para integração: usar um banco de teste isolado (Supabase branch/local Postgres) — documentar como rodar; nunca apontar para produção.
5. Adicionar job de **testes** ao `ci.yml` (unit obrigatório bloqueante; e2e opcional/nightly inicialmente).

## Critério de Aceite
- [ ] `npm test` roda Vitest (mesmo que com 1 teste smoke).
- [ ] `npm run test:e2e` roda Playwright localmente.
- [ ] CI executa testes unit e falha se quebrarem.
- [ ] Documentação curta de como rodar (DB de teste isolado).
- [ ] `npm run typecheck` + `lint` verdes.
