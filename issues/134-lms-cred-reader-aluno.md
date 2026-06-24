# Issue 134 — Leitor por-matrícula (área do aluno)

**Tipo:** infra
**Escopo:** `src/lib/students/lms-credentials.ts` (novo)
**Depende de:** 130, 132
**Prioridade:** P1

## Contexto

Um único caminho seguro para ler/decifrar a credencial, espelhando `getStudentPlatformCredentials` (padrão EA).

## O que fazer

- `getLmsEnrollmentCredentials(studentId)`:
  - Só matrículas `ACTIVE`/`COMPLETED` com `lmsLogin != null` (gate de pagamento).
  - `decrypt(lmsSenha)` em `try/catch` — corrompido degrada a `null` (não quebra a página).
  - Retorna `{ courseId, courseNome, login, senha|null, portalUrl, playback }[]`.
- O caller passa `session.studentId` (nunca id de query param).

## Critérios de Aceite

- [ ] Retorna só com matrícula paga
- [ ] `lmsSenha` corrompida → `null` (sem throw)
- [ ] `npx tsc --noEmit` verde
