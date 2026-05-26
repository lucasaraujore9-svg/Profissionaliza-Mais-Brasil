import { contextLogger } from "@/lib/logger"

/**
 * Audit log estruturado.
 *
 * Por que este wrapper existe:
 *   Operações sensíveis (block/unblock aluno, mudança de planValue,
 *   mark-paid, criação/desativação de cupom, impersonation, refund) precisam
 *   deixar trilha permanente para investigação forense e conformidade LGPD.
 *
 *   A versão definitiva exigiria um model `AuditLog` no Prisma. A migration
 *   foi suspensa porque DB compartilhado precisa autorização explícita do
 *   operador — em vez disso, padronizamos a emissão via logger Pino com
 *   `event: "audit.*"` para que dataset Axiom/Logflare/Datadog indexe e
 *   permita queries (`event:audit.*`).
 *
 *   Quando AuditLog table existir, basta trocar `logger.info` por
 *   `prisma.auditLog.create` aqui — todos os call-sites já passam os
 *   campos corretos.
 *
 * Como usar:
 *   await logAudit({
 *     action: "student.block",
 *     resource: "Student",
 *     resourceId: studentId,
 *     actorUserId: session.userId,
 *     actorRole: session.role,
 *     tenantId: student.tenantId,
 *     payloadBefore: { status: oldStatus },
 *     payloadAfter:  { status: "BLOQUEADO" },
 *   })
 */

export interface AuditEntry {
  action: string
  resource: string
  resourceId?: string | null
  actorUserId?: string | null
  actorStudentId?: string | null
  actorRole: string
  actorEmail?: string | null
  tenantId?: string | null
  payloadBefore?: unknown
  payloadAfter?: unknown
  ip?: string | null
  userAgent?: string | null
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  contextLogger().info(
    {
      event: `audit.${entry.action}`,
      audit: true,
      action: entry.action,
      resource: entry.resource,
      resourceId: entry.resourceId ?? null,
      actorUserId: entry.actorUserId ?? null,
      actorStudentId: entry.actorStudentId ?? null,
      actorRole: entry.actorRole,
      actorEmail: entry.actorEmail ?? null,
      tenantId: entry.tenantId ?? null,
      payloadBefore: entry.payloadBefore ?? null,
      payloadAfter: entry.payloadAfter ?? null,
      ip: entry.ip ?? null,
      userAgent: entry.userAgent ?? null,
    },
    `audit: ${entry.action} on ${entry.resource}${entry.resourceId ? `#${entry.resourceId}` : ""}`,
  )
}
