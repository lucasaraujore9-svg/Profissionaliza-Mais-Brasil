# Issue 136 — UI da gestão (admin + painel)

**Tipo:** behavior
**Escopo:** `src/lib/students/load-detail.ts`, `src/components/shared/student-management/types.ts`,
`src/components/shared/student-management/security-tab.tsx`
**Depende de:** 130, 132, 134
**Prioridade:** P1

## Contexto

Ao abrir um aluno no painel (admin/revenda), o operador deve ver a credencial do LMS por curso — igual já vê a
senha da EA. Isolamento: revenda só vê os próprios alunos.

## O que fazer

- `load-detail.ts`: **adicionar ao `include.enrollments`** os campos `lmsLogin, lmsSenha, lmsPlayback,
  lmsPortalUrl, lmsOrigin` + `course.provider` (hoje só traz `course.nome`). Decifrar `lmsSenha` (padrão do
  `plataformaSenha`) e expor `lmsCredentials[]`, **lendo das matrículas já escopadas por tenant**.
- `types.ts`: add `lmsCredentials?` ao `StudentData`.
- `security-tab.tsx` (`PlatformAccessSection`): bloco "Acesso ao LMS (por curso)" com revelar/copiar + link do
  portal, distinguindo EA-global vs LMS-por-curso.

## Critérios de Aceite

- [ ] `/admin/alunos/[id]` e `/painel/alunos/[id]` mostram credencial LMS por curso
- [ ] Revenda não vê aluno de outra (isolamento por tenant)
- [ ] `npx tsc --noEmit` + `npm run build` verdes
