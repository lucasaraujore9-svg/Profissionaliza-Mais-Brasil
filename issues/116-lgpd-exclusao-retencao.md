# Issue 116 — LGPD: exclusão/anonimização de dados, retenção e registro de aceite

**Tipo:** lgpd / feature (remediação)
**Escopo:** `src/app/aluno/*` (área do aluno) · `src/app/api/aluno/*` · `prisma/schema.prisma` (Student, Lead) · novo cron de retenção · fluxo de aceite de termos
**Depende de:** nenhuma
**Prioridade:** P1
**Risco:** R13 (Alto) + R38 (Baixo)

## Contexto / Evidência
- **R13:** não há endpoint/fluxo de **exclusão** de conta/dados do titular (direito do art. 18 LGPD),
  nem soft-delete.
- **R38:** aceite de termos sem `termsAcceptedAt`/versão no banco; retenção de Lead/Student sem TTL.

## O Que Fazer
1. Implementar exclusão/anonimização do titular (aluno): endpoint autenticado que anonimiza PII
   (nome/CPF/email/telefone) preservando integridade contábil (não apagar Payment/Enrollment, mas
   desvincular PII). Decidir hard-delete vs anonimização.
2. Registrar `termsAcceptedAt` + versão dos termos no aceite (cadastro/checkout).
3. Definir política de **retenção** (Lead inativo, Student inativo) e automatizar expurgo/anonimização
   via cron (similar a `cleanup-webhook-logs`).
4. (Opcional) exportação/portabilidade dos dados do titular.

## Decisão humana necessária
- Política de retenção (prazos) e se exclusão é hard-delete ou anonimização — **jurídico/negócio**.

## Critério de Aceite
- [ ] Titular consegue solicitar exclusão/anonimização (registrado e auditado).
- [ ] `termsAcceptedAt`+versão persistidos no aceite.
- [ ] Cron de retenção definido e documentado.
- [ ] Integridade contábil preservada após anonimização.
- [ ] R13/R38 atualizados em `audit/MATRIZ_DE_RISCOS.md` e `CHECKLIST_ISO_READINESS.md`.
- [ ] `npm run typecheck` + `lint` verdes.
