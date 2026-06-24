# Issue 130 — Schema + migration: credencial LMS na Enrollment

**Tipo:** infra
**Escopo:** `prisma/schema.prisma`, `prisma/migrations/20260627_lms_credentials/migration.sql`
**Depende de:** —
**Prioridade:** P0

## Contexto

O LMS passará a devolver `partnerAccess {login, password, portalUrl}` por matrícula (curso de parceiro
*redirect* e curso próprio). Precisamos de onde guardar — por matrícula, pois `origin`/`playback` variam por
curso. Espelha o padrão da EA (`plataformaAlunoSenha`/`ea_aluno_senha`).

## O que fazer

- Em `model Enrollment` (perto de `lmsEnrollmentId`), adicionar:
  - `lmsOrigin String? @map("lms_origin")` — `"own"` ou chave do parceiro.
  - `lmsPlayback String? @map("lms_playback")` — `"local"` | `"redirect"`.
  - `lmsLogin String? @map("lms_login")`.
  - `lmsSenha String? @map("lms_senha")` — **cifrada** (AES-256-GCM).
  - `lmsPortalUrl String? @map("lms_portal_url") @db.Text`.
- Migration idempotente `prisma/migrations/20260627_lms_credentials/migration.sql` no molde de
  `20260619_lms_provider` (`ALTER TABLE "enrollments" ADD COLUMN IF NOT EXISTS ...`).

## Critérios de Aceite

- [ ] `npx prisma generate` + `npx tsc --noEmit` verdes
- [ ] SQL re-executável (idempotente)
- [ ] Campos nullable (não quebram matrículas existentes)
