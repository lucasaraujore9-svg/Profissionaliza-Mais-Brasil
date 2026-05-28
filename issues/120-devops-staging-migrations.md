# Issue 120 — Deploy seguro: advisory lock, staging e migrations gated

**Tipo:** devops (remediação)
**Escopo:** `scripts/apply-pending-migrations.mjs` · `package.json` (scripts build/db:reset) · Vercel (envs por ambiente, preview vs prod) · `tsconfig.json`
**Depende de:** nenhuma
**Prioridade:** P2
**Risco:** R17 (Alto) + R27 (Médio) + R37 (Baixo)

## Contexto / Evidência
- **R17:** `build` roda `db:apply-pending` sem `pg_advisory_lock` → dois deploys simultâneos podem
  rodar a mesma migration em race. Não há ambiente de **staging** separado (previews provavelmente
  apontam para o banco de produção e aplicam migrations).
- **R27:** o bootstrap marca todas as migrations como aplicadas sem rodar — pode mascarar drift.
- **R37:** `db:reset --force` exposto sem guarda de `NODE_ENV=production`; `tsconfig target ES2017`.

## O Que Fazer
1. Envolver a aplicação de migrations em `pg_advisory_xact_lock` (serializa deploys concorrentes).
2. Criar **ambiente de staging** com banco isolado; previews da Vercel **não** devem usar o DB de
   produção (configurar `DATABASE_URL` por ambiente). Avaliar separar `db:apply-pending` do `build`
   e rodá-lo num passo de release controlado (ou `prisma migrate deploy` gated).
3. Proteger `db:reset` contra `NODE_ENV=production` (abortar).
4. Subir `tsconfig target` (ES2020+).
5. Documentar detecção de drift (avisar quando hash difere — já há warning; promover a erro opcional).

## Critério de Aceite
- [ ] Migrations sob advisory lock (sem race em deploy concorrente).
- [ ] Staging com DB isolado; previews não tocam produção.
- [ ] `db:reset` falha em produção.
- [ ] `tsconfig target` atualizado; build verde.
- [ ] R17/R27/R37 atualizados em `audit/MATRIZ_DE_RISCOS.md` e `CHECKLIST_PRODUCAO.md`.
