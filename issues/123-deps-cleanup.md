# Issue 123 — Limpeza de dependências e supply chain

**Tipo:** dep (remediação)
**Escopo:** `package.json` · `package-lock.json` · `src/components/admin/report-viewer.tsx` (uso de xlsx)
**Depende de:** nenhuma
**Prioridade:** P3
**Risco:** R33 (Baixo) + R34 (Baixo)

## Contexto / Evidência
- **R33:** `xlsx` (HIGH: prototype pollution + ReDoS, sem fix) usado **só para export**
  (`report-viewer.tsx:102`); `XLSX.read` nunca é chamado — risco real baixo, mas convém migrar.
- **R34:** `animejs` e `zustand` **sem nenhum uso** em `src/`; `shadcn` (CLI) está em `dependencies`.
- `brace-expansion` (devDep) tem fix simples via `npm audit fix`.

## O Que Fazer
1. Migrar geração de planilha de `xlsx` → `exceljs` (1 arquivo) e remover `xlsx`.
2. Remover `animejs` e `zustand` de `dependencies` (confirmar zero imports antes).
3. Mover `shadcn` para `devDependencies`.
4. Rodar `npm audit fix` para `brace-expansion`.
5. Reexecutar `npm audit` e `npm run build` (em ambiente isolado) para confirmar que nada quebrou.

## Critério de Aceite
- [ ] `xlsx` removido; export funcionando via `exceljs` (teste manual de export).
- [ ] `animejs`/`zustand` removidos; `shadcn` em devDependencies.
- [ ] `npm audit` reduzido (sem o HIGH do xlsx).
- [ ] `npm run typecheck` + `lint` + build verdes.
- [ ] R33/R34 atualizados em `audit/MATRIZ_DE_RISCOS.md`.
