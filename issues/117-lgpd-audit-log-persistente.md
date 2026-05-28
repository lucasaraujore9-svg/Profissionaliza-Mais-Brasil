# Issue 117 — Audit log persistente em banco para ações sensíveis

**Tipo:** lgpd / observabilidade (remediação)
**Escopo:** `src/lib/observability/*` (`logAudit`) · `prisma/schema.prisma` (novo model `AuditLog`) · pontos de chamada (impersonation, bloqueio/desbloqueio, alterações financeiras, mudanças de papel/permissão, exclusão de dados)
**Depende de:** nenhuma
**Prioridade:** P1
**Risco:** R14 (Alto)

## Contexto / Evidência
`logAudit()` emite apenas para Pino/stdout — **sem tabela no banco**. Logs de stdout são voláteis e
dependem de log drain configurado; inutilizável para investigação forense ou requisição da ANPD.

## O Que Fazer
1. Criar model `AuditLog` (id, actorUserId, actorRole, action, targetType, targetId, tenantId, metadata
   jsonb, ip, createdAt) com índices por actor/target/createdAt. Migration idempotente.
2. `logAudit()` passa a **gravar no banco** (além de Pino).
3. Cobrir ações sensíveis: impersonation (start/end), bloqueio/desbloqueio de aluno/tenant, alterações
   financeiras (mark-paid, payouts), mudança de papel/permissão (issue 101), exclusão de dados (issue 116).
4. Definir retenção do próprio audit log.

## Critério de Aceite
- [ ] Tabela `AuditLog` criada (migration aplicada).
- [ ] Ações sensíveis geram registro persistente com ator, alvo, timestamp, IP.
- [ ] Consulta/admin para inspecionar trilha (mesmo que via DB).
- [ ] R14 atualizado em `audit/MATRIZ_DE_RISCOS.md` e `CHECKLIST_ISO_READINESS.md`.
- [ ] `npm run typecheck` + `lint` verdes.
