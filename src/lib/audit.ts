import { contextLogger } from "@/lib/logger"
import { prisma } from "@/lib/prisma"
import { swallow } from "@/lib/errors"
import { Prisma } from "@prisma/client"

/**
 * Audit log estruturado.
 *
 * Por que este wrapper existe:
 *   Operações sensíveis (block/unblock aluno, mudança de planValue,
 *   mark-paid, criação/desativação de cupom, impersonation, refund) precisam
 *   deixar trilha permanente para investigação forense e conformidade LGPD.
 *
 *   Persiste na tabela `audit_logs` (model AuditLog) E emite no logger Pino
 *   (`event: "audit.*"`) — redundância: o banco dá trilha consultável/forense
 *   e o stream Pino alimenta dataset externo (Axiom/Datadog) para alertas.
 *   A persistência falha de forma segura (swallow) para nunca derrubar a
 *   operação de negócio caso o INSERT de auditoria falhe.
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
  // Persiste no banco (trilha forense consultável). Falha de forma segura —
  // auditoria nunca deve derrubar a operação de negócio que a disparou.
  await prisma.auditLog
    .create({
      data: {
        action: entry.action,
        resource: entry.resource,
        resourceId: entry.resourceId ?? null,
        actorUserId: entry.actorUserId ?? null,
        actorStudentId: entry.actorStudentId ?? null,
        actorRole: entry.actorRole,
        actorEmail: entry.actorEmail ?? null,
        tenantId: entry.tenantId ?? null,
        payloadBefore:
          entry.payloadBefore == null
            ? Prisma.DbNull
            : (entry.payloadBefore as Prisma.InputJsonValue),
        payloadAfter:
          entry.payloadAfter == null
            ? Prisma.DbNull
            : (entry.payloadAfter as Prisma.InputJsonValue),
        ip: entry.ip ?? null,
        userAgent: entry.userAgent ?? null,
      },
    })
    .catch(swallow("audit.persist"))

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
