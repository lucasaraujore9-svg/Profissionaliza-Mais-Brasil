# Issue 133 — Persistir credencial nos satélites de pacote

**Tipo:** behavior
**Escopo:** `src/lib/enrollment/fulfill.ts`
**Depende de:** 130, 131, 132
**Prioridade:** P1

## Contexto

Compra de pacote cria matrículas satélite (finalAmount 0). Os itens LMS de um pacote também precisam guardar
a credencial.

## O que fazer

- Estender o retorno de `provisionCourseForStudent` para incluir `origin`/`playback`/`partnerAccess` (a
  partir de `res`).
- Em `provisionPackageSiblings`, no `enrollment.create` da satélite, gravar `lmsOrigin/lmsPlayback/lmsLogin/
  lmsPortalUrl` e **`lmsSenha: encrypt(...)`** (cifrar igual ao primário — não só "capturar e gravar").

## Critérios de Aceite

- [ ] Pacote com itens LMS grava credencial **cifrada** por satélite
- [ ] `npx tsc --noEmit` verde
