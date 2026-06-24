# Issue 140 — Re-busca/reparo via GET /students/:id

**Tipo:** devops
**Escopo:** `src/app/api/cron/resync-lms-credentials/route.ts` (novo)
**Depende de:** 130, 131, 134
**Prioridade:** P2

## Contexto

A credencial só é gravada no 1º fulfill bem-sucedido. Se ela se perder (ex.: provisionamento parcial que só
ficou ok depois), precisamos de um caminho de reparo. Usa `getLmsStudent` (hoje sem caller).

## O que fazer

- Endpoint no molde de `resync-platform-passwords`: Bearer `CRON_SECRET`, dry-run default, sob `isLmsConfigured()`.
- Para cada aluno/matrícula LMS: chamar `getLmsStudent(student.id)`, casar `access` por curso e regravar
  `Enrollment.lmsSenha = encrypt(...)`/`lmsLogin`/`lmsPortalUrl` quando diverge. **Sem texto plano na resposta.**
- ⚠️ **Isolar do `day-update`**: este endpoint só toca `lmsLogin/lmsSenha/lmsPortalUrl`; o cron day-update só
  toca progresso/status.

## Critérios de Aceite

- [ ] Dry-run mostra divergências
- [ ] `?write=1` re-cifra
- [ ] Recupera o caso "parcial→ok" da Issue 132
- [ ] `npx tsc --noEmit` + `npm run build` verdes
