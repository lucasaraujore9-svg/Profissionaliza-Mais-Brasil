# Issue 135 — UI do aluno + acesso a curso de parceiro (redirect)

**Tipo:** behavior
**Escopo:** `src/app/aluno/page.tsx`, `src/app/aluno/cursos/page.tsx`,
`src/app/api/aluno/curso/[enrollmentId]/acessar/route.ts`, reuso de
`src/components/aluno/platform-credentials-card.tsx`
**Depende de:** 131, 132, 134
**Prioridade:** P1

## Contexto

O aluno precisa ver login/senha e conseguir acessar. Curso próprio = SSO (player do LMS); curso de parceiro
(`redirect`) = portal do parceiro com credenciais. Decisão: **card + botão "Acessar no parceiro"** (não
auto-redirect).

## O que fazer

- Reusar `PlatformCredentialsCard` com `loginUrl=portalUrl`.
- `aluno/page.tsx`: somar `getLmsEnrollmentCredentials(session.studentId)` ao `Promise.all` e renderizar o card
  **apenas a partir da lista filtrada da Issue 134** (⚠️ nunca iterar `enrollments` crus — incluem `PENDING`).
- `aluno/cursos/page.tsx`: ramificar por `lmsPlayback` (incluir `lmsPlayback`/`lmsPortalUrl` no select).
- `acessar/route.ts`: incluir `lmsPlayback` no select; `redirect` → redireciona ao `lmsPortalUrl` **lido do
  banco** (ou 409 se ausente); `own`/`local`/**`lmsPlayback IS NULL`** → mantém `createLmsSsoToken`.

## Critérios de Aceite

- [ ] Curso próprio entra por SSO (inalterado)
- [ ] Curso de parceiro mostra card + botão portal
- [ ] Matrícula não paga **não** exibe card
- [ ] `npx tsc --noEmit` + `npm run build` verdes
