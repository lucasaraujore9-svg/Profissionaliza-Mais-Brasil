# Issue 131 — Tipos do client LMS (partnerAccess + access)

**Tipo:** infra
**Escopo:** `src/lib/lms/types.ts`
**Depende de:** —
**Prioridade:** P0

## Contexto

O `lmsRequest` já repassa o envelope inteiro; só falta declarar os novos campos do contrato para o TS
reconhecê-los. Contrato resolvido: `partnerAccess` na resposta da matrícula e `access` por curso no perfil.

## O que fazer

- `LmsEnrollmentResponse`: adicionar `partnerAccess?: { login: string; password: string; portalUrl: string } | null`.
- `LmsStudentCourse`: adicionar `access?: { login: string; password: string; portalUrl: string } | null`.

## Critérios de Aceite

- [ ] `npx tsc --noEmit` verde
- [ ] Campos opcionais — callers existentes não quebram
